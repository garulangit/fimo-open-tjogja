#!/usr/bin/env python3
"""Uji E2E fondasi auth di staging: fixture via Admin API, alur via curl cookie jar."""
import json
import subprocess
import sys
import urllib.request

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

results = []


def check(name, cond, note=""):
    results.append((name, bool(cond), note))
    print(("PASS " if cond else "FAIL "), name, ("- " + note) if note else "")


def sql(query):
    out = subprocess.run(
        ["python3", SB, "POST", f"/v1/projects/{REF}/database/query", "--json", json.dumps({"query": query})],
        capture_output=True, text=True,
    )
    return json.loads(out.stdout) if out.stdout.strip().startswith("[") else out.stdout


def admin_api(method, path, body=None):
    # curl, bukan urllib: urllib lewat proxy sandbox tidak andal ke
    # supabase.co (IncompleteRead/RemoteDisconnected) — pola suite baru.
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
    cmd = ["curl", "-s", "--max-time", "90", "-c", jar, "-b", jar, "-o", "/tmp/e2e-body.html", "-w", "%{http_code} %{redirect_url}"]
    cmd += list(args)
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    except subprocess.TimeoutExpired:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    body = open("/tmp/e2e-body.html", encoding="utf-8", errors="ignore").read()
    parts = out.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


def login(jar, username, password):
    return curl(jar, "-X", "POST", "-d", f"username={username}&password={password}", BASE + "/api/auth/login")


# ---------- Fixture ----------
ids = {}
for uname, role in (("sa_uji", "superadmin"), ("admin_uji", "admin")):
    st, res = admin_api("POST", "/auth/v1/admin/users", {
        "email": f"{uname}@oms.internal", "password": "Uji12345", "email_confirm": True,
        "user_metadata": {"username": uname, "display_name": uname.upper()},
    })
    if st not in (200, 201):
        st2, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
        found = [u for u in lst.get("users", []) if u["email"] == f"{uname}@oms.internal"]
        assert found, (uname, st, res)
        res = {"id": found[0]["id"]}
    ids[uname] = res["id"]
    sql(f"insert into public.user_roles (user_id, role_id) select '{res['id']}', id from public.roles where code='{role}'")
sql("update public.profiles set must_change_password=false where username in ('sa_uji','admin_uji')")
check("Fixture 2 user uji dibuat + role terpasang", len(ids) == 2)

J = "/tmp/jar-"
# ---------- T1/T2 ----------
code, loc, _ = curl(J + "anon", BASE + "/")
check("T1 tanpa login diarahkan ke /login", code.startswith("3") and "/login" in loc, f"{code} {loc}")
code, loc, _ = login(J + "bad", "admin_uji", "SalahBanget1")
check("T2 password salah ditolak", "error=kredensial" in loc, loc)

# ---------- T3 admin ----------
code, loc, _ = login(J + "adm", "admin_uji", "Uji12345")
check("T3a login admin berhasil ke /", code == "303" and loc.rstrip("/").endswith("workers.dev"), loc)
code, _, body = curl(J + "adm", BASE + "/")
check("T3b dashboard admin tampil", code == "200" and "Halo" in body)
code, loc, _ = curl(J + "adm", BASE + "/admin/users")
check("T3c admin DIBLOK dari Manajemen User", "/admin/users" not in loc and code.startswith("3"), f"{code} {loc}")
code, loc, _ = curl(J + "adm", "-X", "POST", "-d",
                     "username=hacker_uji&display_name=X&role_code=superadmin&password=Hack12345",
                     BASE + "/api/admin/users")
check("T3d admin TIDAK bisa membuat akun (API guard)", "error=gagal" in loc, loc)
rows = sql("select count(*)::int as n from public.profiles where username='hacker_uji'")
check("T3e akun hacker_uji memang tidak tercipta", rows[0]["n"] == 0)

# ---------- T5 superadmin membuat staf ----------
code, loc, _ = login(J + "sa", "sa_uji", "Uji12345")
check("T5a login superadmin berhasil", code == "303")
code, _, body = curl(J + "sa", BASE + "/admin/users")
check("T5b superadmin membuka Manajemen User", code == "200" and "Manajemen User" in body)
code, loc, _ = curl(J + "sa", "-X", "POST", "-d",
                     "username=staf_baru&display_name=Staf Baru&role_code=admin&password=Awal123",
                     BASE + "/api/admin/users")
check("T5c superadmin membuat akun staf_baru", "ok=dibuat" in loc, loc)

# ---------- T6 staf baru: wajib ganti password ----------
code, loc, _ = login(J + "staf", "staf_baru", "Awal123")
check("T6a login staf_baru berhasil", code == "303", loc)
code, loc, _ = curl(J + "staf", BASE + "/")
check("T6b staf_baru TERJEBAK ke /change-password", "/change-password" in loc, f"{code} {loc}")
code, loc, _ = curl(J + "staf", "-X", "POST", "-d",
                     "current_password=Ngawur123&new_password=Baru12345&confirm_password=Baru12345",
                     BASE + "/api/account/password")
check("T6c ganti password dgn password lama SALAH ditolak", "error=lama" in loc, loc)
code, loc, _ = curl(J + "staf", "-X", "POST", "-d",
                     "current_password=Awal123&new_password=Baru12345&confirm_password=Baru12345",
                     BASE + "/api/account/password")
check("T6d ganti password benar diterima", code == "303" and "error" not in loc, loc)
code, _, body = curl(J + "staf", BASE + "/")
check("T6e setelah ganti, dashboard terbuka", code == "200" and "Halo" in body)

# ---------- T8 reset oleh superadmin ----------
rows = sql("select id from public.profiles where username='staf_baru'")
staf_id = rows[0]["id"]
code, loc, _ = curl(J + "sa", "-X", "POST", "-d", "action=reset&password=Reset123",
                    f"{BASE}/api/admin/users/{staf_id}")
check("T8a superadmin reset password staf", "ok=reset" in loc, loc)
code, loc, _ = login(J + "staf2", "staf_baru", "Baru12345")
check("T8b password lama staf tidak berlaku lagi", "error=kredensial" in loc, loc)
code, loc, _ = login(J + "staf3", "staf_baru", "Reset123")
code2, loc2, _ = curl(J + "staf3", BASE + "/")
check("T8c password reset berlaku + wajib ganti lagi", "/change-password" in loc2, loc2)

# ---------- T9 nonaktifkan ----------
code, loc, _ = curl(J + "sa", "-X", "POST", "-d", "action=active&active=false",
                    f"{BASE}/api/admin/users/{staf_id}")
check("T9a superadmin menonaktifkan staf", "ok=aktif" in loc, loc)
code, loc, _ = login(J + "staf4", "staf_baru", "Reset123")
check("T9b staf nonaktif tidak bisa masuk", "error=nonaktif" in loc or "error=kredensial" in loc, loc)

# ---------- Audit ----------
rows = sql("select action from public.audit_events order by id")
actions = [r["action"] for r in rows]
for expected in ("user.create", "account.password_change", "user.password_reset", "user.deactivate"):
    check(f"T10 audit mencatat {expected}", expected in actions, ", ".join(actions))

# ---------- Cleanup ----------
for uname, uid in list(ids.items()) + [("staf_baru", staf_id)]:
    admin_api("DELETE", f"/auth/v1/admin/users/{uid}")
rows = sql("select (select count(*) from public.profiles)::int as p, (select count(*) from public.audit_events)::int as a")
print("RESIDU setelah cleanup:", rows)
npass = sum(1 for _, ok, _ in results if ok)
print(f"TOTAL: {npass}/{len(results)} lulus")
sys.exit(0 if npass == len(results) else 1)
