#!/usr/bin/env python3
"""E2E modul Agent (v1.2.0) di staging.

Membuktikan: halaman /agent ter-guard izin agent.use; tanya-jawab nyata
lewat Bridge (jawaban berisi angka production-like staging: 182 booking,
Rp—); audit agent.ask tercatat; akun custom Branding+Agent
bisa bertanya Branding tetapi pertanyaan Klaim DITOLAK (scope ditegakkan
database — tidak ada query agent_claim_* yang tereksekusi untuknya).
"""
import json
import subprocess

BASE = "https://oms-staging.your-staging.workers.dev"
SB = "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py"
REF = "YOUR_PROJECT_REF"
PW = "Uji12345"

env = {}
for line in open("/home/hatch/workspace/oms-fase1/.env.local"):
    if "=" in line:
        k, v = line.strip().split("=", 1)
        env[k] = v
SR = env["SUPABASE_SERVICE_ROLE_KEY"]
SBASE = env["NEXT_PUBLIC_SUPABASE_URL"]

results = []


def check(name, cond, note=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL "), name, ("- " + note) if note else "", flush=True)


def sql(query):
    out = subprocess.run(
        ["python3", SB, "POST", f"/v1/projects/{REF}/database/query", "--json", json.dumps({"query": query})],
        capture_output=True, text=True,
    )
    return json.loads(out.stdout) if out.stdout.strip().startswith("[") else out.stdout


def admin_api(method, path, body=None):
    import os, tempfile
    payload = None
    fd, payload_path = tempfile.mkstemp()
    os.close(fd)
    if body is not None:
        with open(payload_path, "w") as f:
            f.write(json.dumps(body))
        payload = payload_path
    out_path = payload_path + ".out"
    cmd = ["curl", "-s", "--max-time", "60", "-X", method,
           "-H", f"apikey: {SR}", "-H", f"Authorization: Bearer {SR}",
           "-H", "Content-Type: application/json",
           "-o", out_path, "-w", "%{http_code}"]
    if payload:
        cmd += ["-d", "@" + payload]
    cmd.append(SBASE + path)
    last = None
    for _ in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if r.returncode == 0 and r.stdout.strip().isdigit():
            raw = open(out_path, encoding="utf-8", errors="ignore").read()
            try:
                return int(r.stdout.strip()), json.loads(raw or "{}")
            except json.JSONDecodeError:
                return int(r.stdout.strip()), {}
        last = r.stderr or r.stdout
    raise RuntimeError(f"admin_api gagal: {method} {path}: {last}")


BODY = "/tmp/e2e-ag-body.html"


def curl(jar, *args, max_time=120):
    cmd = ["curl", "-s", "--max-time", str(max_time), "-c", jar, "-b", jar,
           "-o", BODY, "-w", "%{http_code} %{redirect_url}"]
    cmd += list(args)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=max_time + 60).stdout.strip()
    body = open(BODY, encoding="utf-8", errors="ignore").read()
    parts = out.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


def login(jar, username):
    return curl(jar, "-X", "POST", "-d", f"username={username}&password={PW}", BASE + "/api/auth/login")


def ask(jar, question):
    import os, tempfile
    fd, p = tempfile.mkstemp()
    with os.fdopen(fd, "w") as f:
        f.write(json.dumps({"question": question}))
    code, _, body = curl(jar, "-X", "POST", "-H", "Content-Type: application/json",
                         "-d", "@" + p, BASE + "/api/agent/ask", max_time=300)
    try:
        return code, json.loads(body)
    except json.JSONDecodeError:
        return code, {"raw": body[:300]}


def make_user(email, username, name):
    st, res = admin_api("POST", "/auth/v1/admin/users", {
        "email": email, "password": PW, "email_confirm": True,
        "user_metadata": {"username": username, "display_name": name},
    })
    if st not in (200, 201):
        st2, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
        found = [u for u in lst.get("users", []) if u["email"] == email]
        assert found, (st, res)
        res = {"id": found[0]["id"]}
    return res["id"]


SA_ID = make_user("ag_sa@oms.internal", "ag_sa", "AG SA")
sql(f"insert into public.user_roles (user_id, role_id) select '{SA_ID}', id from public.roles where code='superadmin' on conflict do nothing")
sql(f"update public.profiles set must_change_password=false, active=true where id='{SA_ID}'")
AG_ID = make_user("ag_user@oms.internal", "ag_user", "AG User")
sql(f"insert into public.user_roles (user_id, role_id) select '{AG_ID}', id from public.roles where code='custom' on conflict do nothing")
sql(f"update public.profiles set must_change_password=false, active=true where id='{AG_ID}'")
check("Fixture ag_sa (superadmin) + ag_user (custom, matriks kosong) siap", True)

J = "/tmp/jar-ag-"
try:
    code, loc, _ = login(J + "sa", "ag_sa")
    check("A1 login ag_sa 303", code == "303", loc)

    code, _, body = curl(J + "sa", BASE + "/agent")
    check("A2 /agent terbuka untuk superadmin + keterangan audit tampil",
          code == "200" and "tercatat untuk keperluan audit" in body)
    check("A3 /agent bermerek FIMO Agent", "FIMO Agent" in body)

    code, data = ask(J + "sa", "Berapa jumlah booking branding yang tercatat dan berapa total nilai kontraknya?")
    ans = data.get("answer", "")
    check("A4 tanya Branding (superadmin) dijawab angka nyata",
          code == "200" and "182" in ans and "—" in ans, ans[:120])

    rows = sql(f"""select count(*)::int as n from public.audit_events
                   where module_code='agent' and action='agent.ask' and actor_id='{SA_ID}'
                     and detail->>'scope' = 'superadmin'""")
    check("A5 audit agent.ask tercatat (scope superadmin)", rows and rows[0]["n"] >= 1, str(rows))

    # Akun custom TANPA matriks agent: /agent tertutup (redirect ke /)
    code, loc, _ = login(J + "u0", "ag_user")
    code2, loc2, _ = curl(J + "u0", BASE + "/agent")
    check("A6 /agent tertutup tanpa centang Agent (redirect)",
          code2 in ("303", "307", "308") and loc2.rstrip("/").endswith(".dev"), f"{code2} -> {loc2}")

    # Centang Agent(Read) + Branding(Read) lewat route matriks aplikasi.
    feat = "&".join(
        f"feat_{f}=on"
        for f in ("branding.overview", "branding.bookings", "branding.history",
                  "branding.buses", "branding.pricing", "branding.documents", "branding.reports")
    )
    code, loc, _ = curl(J + "sa", "-X", "POST",
                        "-d", "read_agent=on&read_branding=on&" + feat,
                        f"{BASE}/api/admin/users/{AG_ID}/module-access")
    check("A7 simpan matriks Agent+Branding diterima", "ok=akses" in loc, loc)

    code, loc, _ = login(J + "u1", "ag_user")
    _, _, body = curl(J + "u1", BASE + "/home")
    check("A8 Home: tile Agent + Branding tampil, Klaim sembunyi",
          'href="/agent"' in body and 'href="/branding"' in body and 'href="/claim"' not in body)

    code, data = ask(J + "u1", "Berapa jumlah booking branding yang tercatat?")
    ans = data.get("answer", "")
    check("A9 tanya Branding (akun branding) dijawab", code == "200" and "182" in ans, ans[:120])

    code, data = ask(J + "u1", "Berapa total subsidi klaim yang sudah cair tahun 2026?")
    ans = data.get("answer", "")
    rows = sql(f"""select detail->>'scope' as scope, coalesce(detail->'queries','[]'::jsonb)::text as q
                   from public.audit_events
                   where module_code='agent' and action='agent.ask' and actor_id='{AG_ID}'
                   order by id desc limit 1""")
    q = rows[0]["q"] if rows else ""
    check("A10 tanya Klaim oleh akun Branding: scope tercatat 'branding'",
          bool(rows) and rows[0]["scope"] == "branding", str(rows))
    check("A11 TIDAK ada query agent_claim_* yang tereksekusi untuk akun Branding",
          "agent_claim" not in q, q[:150])
    import re as _re
    check("A12 jawaban Klaim = penolakan netral (tanpa angka / substitusi modul lain)",
          code == "200" and len(ans) > 10 and not _re.search(r"Rp\s?[\d.]{6,}", ans)
          and "cair adalah" not in ans.lower(), ans[:150])
finally:
    for uid in (AG_ID, SA_ID):
        if uid:
            admin_api("DELETE", f"/auth/v1/admin/users/{uid}")
    residue = sql("""select count(*)::int as users from auth.users
                     where email in ('ag_sa@oms.internal','ag_user@oms.internal')""")
    check("A13 cleanup: user uji terhapus", residue[0]["users"] == 0, str(residue))

failed = [n for n, ok in results if not ok]
print(f"\n== {len(results) - len(failed)}/{len(results)} PASS ==")
if failed:
    print("GAGAL:", failed)
    raise SystemExit(1)
