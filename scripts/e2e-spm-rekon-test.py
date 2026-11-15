#!/usr/bin/env python3
"""E2E rekonsiliasi otomatis SPM (migration 0019) di staging.

Alur yang dibuktikan, di atas salinan data production (30 batch / 636 temuan):
  R0 hitungan staging = production
  R1 impor DISHUB OP-006 dengan jam_berhenti/jam_jalan -> durasi Dishub
      dihitung server (termasuk lewat tengah malam)
  R2 impor OPERATOR atas 6 temuan OP-006 nyata: 3 durasi < 180 mnt ->
      'Klarifikasi Diajukan'; 3 durasi >= 180 mnt (satu tepat 180) -> tetap
      pelanggaran; respons melaporkan cocok/ klarifikasi/ tetap
  R3 impor OPERATOR OP-028 tanpa kolom durasi -> cocok, status tidak berubah
  R4 keputusan 2 tombol (PATCH Disetujui / Disanggah)
  R5 penetapan: Klarifikasi Diajukan & Disanggah DITOLAK, Disetujui MASUK
  R6 GET findings menampilkan kolom durasi baru
Temuan nyata staging dipulihkan ke keadaan semula di akhir (status +
kolom operator di-null-kan); temuan & penalti uji dihapus.
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
    # Pakai curl (subprocess), bukan urllib: urllib lewat egress proxy
    # sandbox tidak andal (RemoteDisconnected sewaktu-waktu).
    cmd = ["curl", "-s", "--max-time", "60", "-X", method,
           "-H", f"apikey: {SR}", "-H", f"Authorization: Bearer {SR}",
           "-H", "Content-Type: application/json",
           "-w", "\n__CODE__:%{http_code}"]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    cmd.append(SBASE + path)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=90).stdout
    text, _, code = out.rpartition("\n__CODE__:")
    try:
        return int(code.strip()), json.loads(text or "{}")
    except (ValueError, json.JSONDecodeError):
        return 0, {"raw": text[:200]}


def curl(jar, *args, out="/tmp/e2e-spm-rekon-body.txt"):
    cmd = ["curl", "-s", "--max-time", "90", "-c", jar, "-b", jar, "-o", out, "-w", "%{http_code} %{redirect_url}"]
    cmd += list(args)
    raw = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    body = open(out, encoding="utf-8", errors="ignore").read()
    parts = raw.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


def login(jar, username):
    return curl(jar, "-X", "POST", "-d", f"username={username}&password={PW}", BASE + "/api/auth/login")


def jcall(jar, method, path, payload=None, out="/tmp/e2e-spm-rekon-json.txt"):
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
for uname, role in (("spm2_sa", "superadmin"), ("spm2_user", None)):
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
sql("update public.profiles set must_change_password=false, active=true where username in ('spm2_sa','spm2_user')")
check("Fixture spm2_sa (superadmin) + spm2_user (tanpa role) dibuat", len(ids) == 2)

J = "/tmp/jar-spm2-"
# 6 temuan OP-006 nyata, kunci (tanggal+lambung+kode) unik, durasi Dishub ter-backfill.
SIX = sql("""
select id, occurred_date, fleet_no, violation_code, dishub_duration_min
from public.spm_findings f
where violation_code='OP-006' and status='Pending Review' and dishub_duration_min is not null
  and (select count(*) from public.spm_findings g
       where g.occurred_date=f.occurred_date and g.fleet_no=f.fleet_no
         and g.violation_code=f.violation_code) = 1
order by occurred_date limit 6""")
OP28 = sql("""
select id, occurred_date, fleet_no, violation_code
from public.spm_findings f
where violation_code='OP-028' and status='Pending Review'
  and (select count(*) from public.spm_findings g
       where g.occurred_date=f.occurred_date and g.fleet_no=f.fleet_no
         and g.violation_code=f.violation_code) = 1
order by occurred_date limit 1""")
assert len(SIX) == 6, SIX
assert len(OP28) == 1, OP28
SIX_IDS = [r["id"] for r in SIX]
OP28_ID = OP28[0]["id"]
# 3 durasi < 180 (60, 149, 60 lewat tengah malam), 3 durasi >= 180 (180 tepat, 240, 390).
DURATIONS = [(60, "08:00", "09:00"), (149, "10:00", "12:29"), (60, "23:30", "00:30"),
             (180, "08:00", "11:00"), (240, "08:00", "12:00"), (390, "07:00", "13:30")]

try:
    # ---------- R0: hitungan staging = production ----------
    counts = sql("select (select count(*) from public.spm_import_batches) as b, "
                 "(select count(*) from public.spm_findings) as f, "
                 "(select count(*) from public.spm_violation_rates) as r, "
                 "(select count(*) from public.spm_findings where status='Pending Review') as p, "
                 "(select count(*) from public.spm_findings where status='Matched') as m")[0]
    check("R0 staging = production (30 batch / 636 temuan / 53 tarif; 635 Pending + 1 Matched)",
          counts == {"b": 30, "f": 636, "r": 53, "p": 635, "m": 1}, str(counts))

    # ---------- R1: izin + impor DISHUB berdurasi ----------
    code, loc, _ = login(J + "u", "spm2_user")
    check("R1a login spm2_user berhasil", code == "303", loc)
    code, res = jcall(J + "u", "POST", "/api/spm/findings", {"source": "DISHUB", "fileName": "e2e-rekon.csv", "rows": []})
    check("R1b impor tanpa izin = 403", code == "403")
    code, loc, _ = login(J + "sa", "spm2_sa")
    check("R1c login spm2_sa berhasil", code == "303", loc)
    code, res = jcall(J + "sa", "POST", "/api/spm/findings", {
        "source": "DISHUB", "fileName": "e2e-rekon-dishub.csv", "rawCsv": "e2e",
        "rows": [
            {"sourceRef": "E2E-REKON-D1", "date": "2026-10-04", "time": "08:00", "fleet": "A001", "code": "OP-006",
             "evidence": "Uji Dishub 210 mnt", "stopAt": "08:00", "resumeAt": "11:30"},
            {"sourceRef": "E2E-REKON-D2", "date": "2026-10-05", "time": "23:30", "fleet": "A002", "code": "OP-006",
             "evidence": "Uji Dishub tengah malam", "stopAt": "23:30", "resumeAt": "00:30"},
        ],
    })
    check("R1d impor Dishub 2 baris masuk", res.get("inserted") == 2, str(res)[:160])
    rows = sql("select source_ref, dishub_stop_at, dishub_resume_at, dishub_duration_min "
               "from public.spm_findings where source_ref like 'E2E-REKON-D%' order by source_ref")
    d1 = next((r for r in rows if r["source_ref"] == "E2E-REKON-D1"), {})
    d2 = next((r for r in rows if r["source_ref"] == "E2E-REKON-D2"), {})
    check("R1e durasi Dishub dihitung server: 210 mnt (08:00-11:30)",
          d1.get("dishub_duration_min") == 210 and d1.get("dishub_stop_at") == "08:00", str(d1))
    check("R1f durasi lewat tengah malam: 60 mnt (23:30-00:30)",
          d2.get("dishub_duration_min") == 60 and d2.get("dishub_resume_at") == "00:30", str(d2))

    # ---------- R2: impor OPERATOR atas 6 temuan OP-006 nyata ----------
    op_rows = []
    for r, (dur, stop, resume) in zip(SIX, DURATIONS):
        op_rows.append({"date": r["occurred_date"][:10], "fleet": r["fleet_no"], "code": "OP-006",
                        "evidence": f"Klarifikasi operator uji {dur} mnt",
                        "stopAt": stop, "resumeAt": resume})
    code, res = jcall(J + "sa", "POST", "/api/spm/findings", {
        "source": "OPERATOR", "operatorName": "Operator A", "fileName": "e2e-rekon-op.csv", "rows": op_rows,
    })
    check("R2a impor operator: cocok 6, klarifikasi 3, tetap pelanggaran 3",
          res.get("matched") == 6 and res.get("clarified") == 3 and res.get("stillViolation") == 3,
          str(res)[:200])
    after = sql("select id, status, operator_duration_min from public.spm_findings "
                f"where id in ({','.join(repr(i) for i in SIX_IDS)}) order by occurred_date")
    by_id = {r["id"]: r for r in after}
    short_ok = all(by_id[SIX[i]["id"]]["status"] == "Klarifikasi Diajukan"
                   and by_id[SIX[i]["id"]]["operator_duration_min"] == DURATIONS[i][0]
                   for i in range(3))
    long_ok = all(by_id[SIX[i]["id"]]["status"] == "Pending Review"
                  and by_id[SIX[i]["id"]]["operator_duration_min"] == DURATIONS[i][0]
                  for i in range(3, 6))
    check("R2b 3 durasi < 180 mnt -> Klarifikasi Diajukan + durasi tersimpan", short_ok, str(after)[:300])
    check("R2c 3 durasi >= 180 mnt (termasuk tepat 180) -> tetap Pending Review", long_ok, str(after)[:300])

    # ---------- R3: impor OPERATOR OP-028 tanpa kolom durasi ----------
    o = OP28[0]
    code, res = jcall(J + "sa", "POST", "/api/spm/findings", {
        "source": "OPERATOR", "operatorName": "Operator B", "fileName": "e2e-rekon-op28.csv",
        "rows": [{"date": o["occurred_date"][:10], "fleet": o["fleet_no"], "code": "OP-028",
                  "evidence": "Klarifikasi overspeed uji"}],
    })
    check("R3a impor operator OP-028: cocok 1, klarifikasi 0",
          res.get("matched") == 1 and res.get("clarified") == 0, str(res)[:160])
    r28 = sql(f"select status, operator_evidence, operator_duration_min from public.spm_findings where id='{OP28_ID}'")[0]
    check("R3b OP-028: status tetap Pending Review, bukti operator tersimpan, tanpa durasi",
          r28["status"] == "Pending Review" and r28["operator_evidence"] == "Klarifikasi overspeed uji"
          and r28["operator_duration_min"] is None, str(r28))

    # ---------- R4: keputusan 2 tombol ----------
    code, res = jcall(J + "sa", "PATCH", f"/api/spm/findings/{SIX[3]['id']}", {"status": "Disetujui"})
    check("R4a tombol Disetujui tersimpan", res.get("ok") is True, str(res)[:80])
    code, res = jcall(J + "sa", "PATCH", f"/api/spm/findings/{SIX[4]['id']}",
                      {"status": "Disanggah", "explanation": "Bukti operator tidak meyakinkan"})
    check("R4b tombol Disanggah + alasan tersimpan", res.get("ok") is True, str(res)[:80])
    st = sql("select id, status, explanation from public.spm_findings "
             f"where id in ('{SIX[3]['id']}','{SIX[4]['id']}')")
    check("R4c status + alasan terbaca kembali",
          any(r["status"] == "Disetujui" for r in st)
          and any(r["status"] == "Disanggah" and r["explanation"] == "Bukti operator tidak meyakinkan" for r in st),
          str(st))

    # ---------- R5: penetapan hanya dari Disetujui ----------
    pre = sql("select count(*)::int as n from public.spm_findings "
              "where status='Disetujui' and occurred_date >= '2026-01-01' and occurred_date < '2027-01-01'")[0]["n"]
    check("R5a sebelum penetapan: tepat 1 Disetujui di 2026", pre == 1, str(pre))
    code, res = jcall(J + "sa", "POST", "/api/spm/penalties", {"year": "2026"})
    check("R5b penetapan: tepat 1 snapshot dibuat (Klarifikasi Diajukan & Disanggah ditolak)",
          res.get("created") == 1, str(res)[:160])
    code, res = jcall(J + "sa", "GET", "/api/spm/penalties?year=2026")
    pens = [p for p in res.get("penalties", []) if p["findingId"] == SIX[3]["id"]]
    rate = next((r for r in jcall(J + "sa", "GET", "/api/spm/rates")[1].get("rates", [])
                 if r["kode_pelanggaran"] == "OP-006"), {})
    check("R5c snapshot = tarif OP-006 x 1, operator Operator A",
          len(pens) == 1 and pens[0]["amount"] == float(rate.get("amount") or 0)
          and pens[0]["operator"] == "Operator A", str(pens)[:200])
    code, res = jcall(J + "sa", "POST", "/api/spm/penalties", {"year": "2026"})
    check("R5d penetapan ulang: 0 baru (idempotent)", res.get("created") == 0, str(res)[:120])

    # ---------- R6: GET menampilkan kolom durasi ----------
    code, res = jcall(J + "sa", "GET", "/api/spm/findings")
    f1 = next((f for f in res.get("findings", []) if f["id"] == SIX[0]["id"]), {})
    check("R6 GET findings: durasi Dishub (backfill) + durasi operator tampil",
          f1.get("dishubDurationMin") is not None and f1.get("operatorDurationMin") == 60
          and f1.get("operatorStopAt") == "08:00", str(f1)[:220])
finally:
    # ---------- Bersih-bersih: pulihkan temuan nyata, hapus fixture uji ----------
    sql("delete from public.spm_penalties where finding_id in (select id from public.spm_findings where source_ref like 'E2E-REKON%')"
        f" or finding_id in ({','.join(repr(i) for i in SIX_IDS)})")
    sql("delete from public.spm_findings where source_ref like 'E2E-REKON%'")
    sql("update public.spm_findings set status='Pending Review', operator_evidence=null, "
        "operator_reported=null, operator_stop_at=null, operator_resume_at=null, "
        "operator_duration_min=null, explanation=null "
        f"where id in ({','.join(repr(i) for i in SIX_IDS + [OP28_ID])})")
    sql("delete from public.spm_import_batches where file_name like 'e2e-rekon-%'")
    for uname, uid in ids.items():
        admin_api("DELETE", f"/auth/v1/admin/users/{uid}")
    left = sql("select (select count(*) from public.spm_findings where source_ref like 'E2E-REKON%') as f, "
               "(select count(*) from public.spm_penalties where finding_id in "
               f"(select id from public.spm_findings where id in ({','.join(repr(i) for i in SIX_IDS)}))) as p, "
               "(select count(*) from public.profiles where username in ('spm2_sa','spm2_user')) as u, "
               "(select count(*) from public.spm_findings where status in ('Klarifikasi Diajukan','Disetujui','Disanggah')) as s")
    residue = left[0] if isinstance(left, list) and left else {}
    print("RESIDU fixture:", residue)
    check("Residu fixture bersih + temuan nyata kembali Pending Review",
          residue.get("f") == 0 and residue.get("p") == 0 and residue.get("u") == 0 and residue.get("s") == 0,
          str(residue))

failed = [n for n, ok in results if not ok]
print(f"TOTAL: {len(results) - len(failed)}/{len(results)} lulus")
if failed:
    raise SystemExit(1)
