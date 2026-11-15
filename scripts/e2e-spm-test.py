#!/usr/bin/env python3
"""E2E backend SPM (migration 0010 + 0019) di staging.

Alur yang dibuktikan: izin (403 tanpa akses) -> master tarif dari DB ->
impor Dishub (masuk + duplikat ditolak + kode asing error) -> impor operator
(sisi kedua rekonsiliasi cocok) -> status Disetujui -> penetapan snapshot
(nominal = tarif x kuantitas) -> status dokumen Finalized -> bersih-bersih.
"""
import json
import subprocess

BASE = "https://oms-staging.your-staging.workers.dev"
SB = "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py"
REF = "YOUR_PROJECT_REF"

env = {}
for line in open("/home/hatch/workspace/fimo-oms-v2/.env.local"):
    if "=" in line:
        k, v = line.strip().split("=", 1)
        env[k] = v
SR = env["SUPABASE_SERVICE_ROLE_KEY"]
SBASE = env["NEXT_PUBLIC_SUPABASE_URL"]
PW = "Uji12345"

results = []


def check(name, cond, note=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL "), name, ("- " + note) if note else "")


def sql(query):
    out = subprocess.run(
        ["python3", SB, "POST", f"/v1/projects/{REF}/database/query", "--json", json.dumps({"query": query})],
        capture_output=True, text=True,
    )
    return json.loads(out.stdout) if out.stdout.strip().startswith("[") else out.stdout


def admin_api(method, path, body=None):
    import urllib.request, urllib.error
    req = urllib.request.Request(
        SBASE + path,
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"apikey": SR, "Authorization": f"Bearer {SR}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def curl(jar, *args, out="/tmp/e2e-spm-body.txt"):
    cmd = ["curl", "-s", "--max-time", "90", "-c", jar, "-b", jar, "-o", out, "-w", "%{http_code} %{redirect_url}"]
    cmd += list(args)
    raw = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    body = open(out, encoding="utf-8", errors="ignore").read()
    parts = raw.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


def login(jar, username):
    return curl(jar, "-X", "POST", "-d", f"username={username}&password={PW}", BASE + "/api/auth/login")


def jcall(jar, method, path, payload=None, out="/tmp/e2e-spm-json.txt"):
    args = ["-X", method, "-H", "Content-Type: application/json"]
    if payload is not None:
        args += ["-d", json.dumps(payload)]
    code, _, body = curl(jar, *args, BASE + path, out=out)
    try:
        return code, json.loads(body)
    except json.JSONDecodeError:
        return code, {"raw": body[:200]}


# ---------- Fixture ----------
ids = {}
for uname, role in (("spm_sa", "superadmin"), ("spm_user", None)):
    st, res = admin_api("POST", "/auth/v1/admin/users", {
        "email": f"{uname}@oms.internal", "password": PW, "email_confirm": True,
        "user_metadata": {"username": uname, "display_name": uname.upper()},
    })
    if st not in (200, 201):
        st2, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
        found = [u for u in lst.get("users", []) if u["email"] == f"{uname}@oms.internal"]
        assert found, (uname, st, res)
        res = {"id": found[0]["id"]}
    ids[uname] = res["id"]
    if role:
        sql(f"insert into public.user_roles (user_id, role_id) select '{res['id']}', id from public.roles where code='{role}'")
sql("update public.profiles set must_change_password=false, active=true where username in ('spm_sa','spm_user')")
check("Fixture spm_sa (superadmin) + spm_user (tanpa role) dibuat", len(ids) == 2)

J = "/tmp/jar-spm-"
IMPORT_ROWS = [
    {"sourceRef": "E2E-SPM-1", "date": "2026-10-04", "time": "08:30", "fleet": "A001", "code": "OP-001", "evidence": "Uji bukti Dishub 1"},
    {"sourceRef": "E2E-SPM-2", "date": "2026-10-05", "time": "09:15", "fleet": "J025", "code": "OP-002", "evidence": "Uji bukti Dishub 2"},
    {"sourceRef": "E2E-SPM-3", "date": "2026-10-06", "time": "10:00", "fleet": "A002", "code": "KODE-ASING", "evidence": "Harus error"},
]
try:
    # ---------- S1: tanpa akses -> 403 ----------
    code, loc, _ = login(J + "u", "spm_user")
    check("S1a login spm_user berhasil", code == "303", loc)
    code, res = jcall(J + "u", "GET", "/api/spm/findings")
    check("S1b GET findings tanpa izin = 403", code == "403", str(res)[:80])
    code, res = jcall(J + "u", "POST", "/api/spm/penalties", {"year": "2026"})
    check("S1c POST penetapan tanpa izin = 403", code == "403")

    # ---------- S2: master tarif dari DB ----------
    code, loc, _ = login(J + "sa", "spm_sa")
    check("S2a login spm_sa berhasil", code == "303", loc)
    code, res = jcall(J + "sa", "GET", "/api/spm/rates")
    rates = res.get("rates", [])
    op001 = next((r for r in rates if r["kode_pelanggaran"] == "OP-001"), None)
    check("S2b tarif >= 53 baris dari DB", len(rates) >= 53, str(len(rates)))
    check("S2c OP-001 = Rp500.000 & belum terverifikasi",
          op001 is not None and float(op001["amount"]) == 500000 and op001["is_verified"] is False,
          str(op001)[:100])

    # ---------- S3: impor Dishub ----------
    payload = {"source": "DISHUB", "fileName": "e2e-dishub.csv", "rawCsv": "e2e", "rows": IMPORT_ROWS}
    code, res = jcall(J + "sa", "POST", "/api/spm/findings", payload)
    check("S3a impor: 2 masuk, 1 error kode asing",
          res.get("inserted") == 2 and res.get("errors") == 1, str(res)[:160])
    code, res = jcall(J + "sa", "POST", "/api/spm/findings", payload)
    check("S3b impor ulang: 2 duplikat ditolak",
          res.get("inserted") == 0 and res.get("duplicates") == 2, str(res)[:160])

    # ---------- S4: impor operator (sisi kedua) ----------
    code, res = jcall(J + "sa", "POST", "/api/spm/findings", {
        "source": "OPERATOR", "operatorName": "Operator A", "fileName": "e2e-op.csv",
        "rows": [{"date": "2026-10-04", "fleet": "A001", "code": "OP-001", "evidence": "Klarifikasi operator uji"}],
    })
    check("S4a rekonsiliasi operator: 1 cocok", res.get("matched") == 1, str(res)[:120])
    code, res = jcall(J + "sa", "GET", "/api/spm/findings")
    findings = res.get("findings", [])
    f1 = next((f for f in findings if f["sourceCode"] == "E2E-SPM-1"), None)
    f2 = next((f for f in findings if f["sourceCode"] == "E2E-SPM-2"), None)
    check("S4b bukti operator tersimpan di temuan",
          f1 is not None and f1["operatorData"] == "Klarifikasi operator uji", str(f1)[:140])
    check("S4c operator terpetakan A001=Operator A, J025=Operator B",
          f1 is not None and f1["mappedOperator"] == "Operator A" and f2 is not None and f2["mappedOperator"] == "Operator B")

    # ---------- S5: keputusan temuan (2 tombol: Disetujui / Disanggah) ----------
    code, res = jcall(J + "sa", "PATCH", f"/api/spm/findings/{f1['id']}", {"status": "Disetujui"})
    check("S5 status -> Disetujui tersimpan", res.get("ok") is True, str(res)[:80])

    # ---------- S6: penetapan snapshot (hanya Disetujui yang masuk) ----------
    code, res = jcall(J + "sa", "POST", "/api/spm/penalties", {"year": "2026"})
    check("S6a penetapan: tepat 1 snapshot dibuat", res.get("created") == 1, str(res)[:140])
    code, res = jcall(J + "sa", "GET", "/api/spm/penalties?year=2026")
    pens = [p for p in res.get("penalties", []) if p["sourceRef"].startswith("E2E-SPM")]
    check("S6b snapshot nominal = tarif OP-001 (500.000) & operator Operator A",
          len(pens) == 1 and pens[0]["amount"] == 500000 and pens[0]["operator"] == "Operator A",
          str(pens)[:160])

    # ---------- S7: status dokumen ----------
    code, res = jcall(J + "sa", "PATCH", f"/api/spm/penalties/{pens[0]['id']}", {"docStatus": "Finalized"})
    check("S7a doc status -> Finalized", res.get("ok") is True)
    code, res = jcall(J + "sa", "GET", "/api/spm/penalties?year=2026")
    p1 = next((p for p in res.get("penalties", []) if p["id"] == pens[0]["id"]), None)
    check("S7b Finalized terbaca kembali", p1 is not None and p1["docStatus"] == "Finalized")
finally:
    # ---------- Bersih-bersih ----------
    sql("delete from public.spm_penalties where finding_id in (select id from public.spm_findings where source_ref like 'E2E-SPM%')")
    sql("delete from public.spm_findings where source_ref like 'E2E-SPM%'")
    sql("delete from public.spm_import_batches where file_name like 'e2e-%'")
    for uname, uid in ids.items():
        admin_api("DELETE", f"/auth/v1/admin/users/{uid}")
    left = sql("select (select count(*) from public.spm_findings where source_ref like 'E2E-SPM%') as f, (select count(*) from public.profiles where username in ('spm_sa','spm_user')) as p")
    residue = left[0] if isinstance(left, list) and left else {}
    print("RESIDU fixture:", residue)
    check("Residu fixture bersih", residue.get("f") == 0 and residue.get("p") == 0, str(residue))

failed = [n for n, ok in results if not ok]
print(f"TOTAL: {len(results) - len(failed)}/{len(results)} lulus")
if failed:
    raise SystemExit(1)
