#!/usr/bin/env python3
"""E2E login guard (migration 0015) di staging.

Membuktikan tiga pengaman:
 1) Rate limit: 10 kegagalan -> upaya berikutnya (password BENAR pun)
    ditolak 'terkunci'; jendela 15 menit bergeser -> login pulih.
 2) Maks 9 sesi: 11 login dari jar berbeda -> auth.sessions tertahan 9.
 3) Umur sesi 20 jam: created_at sesi dimundurkan 21 jam -> middleware
    mengarahkan ke /api/auth/expired -> /login?error=sesi.
"""
import json
import subprocess

BASE = "https://oms-staging.your-staging.workers.dev"
SB = "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py"
REF = "YOUR_PROJECT_REF"
PW = "Uji12345"
USER = "lg_user"

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
    print(("PASS " if cond else "FAIL "), name, ("- " + note) if note else "")


def sql(query):
    out = subprocess.run(
        ["python3", SB, "POST", f"/v1/projects/{REF}/database/query", "--json", json.dumps({"query": query})],
        capture_output=True, text=True,
    )
    return json.loads(out.stdout) if out.stdout.strip().startswith("[") else out.stdout


def admin_api(method, path, body=None):
    # curl (urllib tidak andal lewat proxy sandbox ke supabase.co)
    import os, tempfile
    payload_path = None
    if body is not None:
        fd, payload_path = tempfile.mkstemp()
        with os.fdopen(fd, "w") as f:
            f.write(json.dumps(body))
    out_path = tempfile.mktemp()
    cmd = ["curl", "-s", "--max-time", "60", "-X", method,
           "-H", f"apikey: {SR}", "-H", f"Authorization: Bearer {SR}",
           "-H", "Content-Type: application/json",
           "-o", out_path, "-w", "%{http_code}"]
    if payload_path:
        cmd += ["-d", "@" + payload_path]
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
        last = r.stderr
    raise RuntimeError(f"admin_api gagal: {method} {path}: {last}")


def curl(jar, *args):
    cmd = ["curl", "-s", "--max-time", "90", "-c", jar, "-b", jar, "-o", "/tmp/e2e-lg-body.html", "-w", "%{http_code} %{redirect_url}"]
    cmd += list(args)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    body = open("/tmp/e2e-lg-body.html", encoding="utf-8", errors="ignore").read()
    parts = out.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


def try_login(jar, password):
    return curl(jar, "-X", "POST", "-d", f"username={USER}&password={password}", BASE + "/api/auth/login")


# ---------- Fixture ----------
st, res = admin_api("POST", "/auth/v1/admin/users", {
    "email": f"{USER}@oms.internal", "password": PW, "email_confirm": True,
    "user_metadata": {"username": USER, "display_name": "LG User"},
})
if st not in (200, 201):
    st2, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
    found = [u for u in lst.get("users", []) if u["email"] == f"{USER}@oms.internal"]
    assert found, (st, res)
    res = {"id": found[0]["id"]}
UID = res["id"]
sql(f"insert into public.user_roles (user_id, role_id) select '{UID}', id from public.roles where code='admin' on conflict do nothing")
sql(f"update public.profiles set must_change_password=false, active=true where id='{UID}'")
sql(f"delete from public.login_attempts where username='{USER}'")
check("Fixture lg_user (admin) siap", True)

J = "/tmp/jar-lg-"
try:
    # ---------- 1) Rate limit ----------
    locs = []
    for i in range(10):
        _, loc, _ = try_login(J + "rl", "salah-terus")
        locs.append(loc)
    check("L1 10x password salah -> tetap error kredensial",
          all("error=kredensial" in loc for loc in locs), locs[-1])
    _, loc, _ = try_login(J + "rl", PW)
    check("L2 password BENAR setelah 10 gagal -> terkunci", "error=terkunci" in loc, loc)
    _, _, body = curl(J + "rl", BASE + "/login?error=terkunci")
    check("L3 halaman login menampilkan pesan terkunci", "Terlalu banyak percobaan" in body)
    sql(f"update public.login_attempts set created_at = now() - interval '16 minutes' where username='{USER}'")
    code, loc, _ = try_login(J + "rl2", PW)
    check("L4 jendela bergeser 16 menit -> login pulih", code == "303" and "error=" not in loc, loc)

    # ---------- 2) Maks 9 sesi ----------
    for i in range(11):
        try_login(J + f"s{i}", PW)
    rows = sql(f"select count(*)::int as n from auth.sessions where user_id='{UID}'")
    check("L5 11 login -> sesi tertahan tepat 9", rows[0]["n"] == 9, str(rows))

    # ---------- 3) Umur sesi 20 jam ----------
    code, loc, _ = try_login(J + "age", PW)
    check("L6 login segar untuk uji umur sesi", code == "303", loc)
    sql(f"""update auth.sessions set created_at = now() - interval '21 hours'
            where id = (select id from auth.sessions where user_id='{UID}'
                        order by created_at desc limit 1)""")
    _, loc, _ = curl(J + "age", BASE + "/home")
    check("L7 sesi 21 jam -> middleware mengalihkan ke /api/auth/expired",
          "/api/auth/expired" in loc, loc)
    _, loc, _ = curl(J + "age", BASE + "/api/auth/expired")
    check("L8 route expired -> /login?error=sesi", "error=sesi" in loc, loc)
    _, _, body = curl(J + "age", BASE + "/home")
    check("L9 setelah expired, /home tidak lagi terbuka", "Fleet Integrated" not in body or "Masuk" in body)

    # ---------- 4) Regresi ringan ----------
    code, loc, _ = try_login(J + "fresh", PW)
    _, _, body = curl(J + "fresh", BASE + "/home")
    check("L10 login normal tetap lancar + Home terbuka",
          code == "303" and "Fleet Integrated" in body)
finally:
    admin_api("DELETE", f"/auth/v1/admin/users/{UID}")
    sql(f"delete from public.login_attempts where username='{USER}'")
    residue = sql(f"select count(*)::int as n from auth.users where id='{UID}'")
    check("L11 cleanup: user uji terhapus", residue[0]["n"] == 0, str(residue))

failed = [n for n, ok in results if not ok]
print(f"\n== {len(results) - len(failed)}/{len(results)} PASS ==")
if failed:
    print("GAGAL:", failed)
    raise SystemExit(1)
