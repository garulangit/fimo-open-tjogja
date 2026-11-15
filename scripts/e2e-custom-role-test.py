#!/usr/bin/env python3
"""E2E role custom (migration 0014) di staging.

Membuktikan: superadmin membuat akun lewat form aplikasi dengan
role_code=custom -> akun bisa login tapi NOL akses (tidak ada tile modul,
matriks kosong) -> dicentang Branding Read lewat matriks -> Branding
terbuka, modul lain tetap tertutup.
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
    print(("PASS " if cond else "FAIL "), name, ("- " + note) if note else "")


def sql(query):
    out = subprocess.run(
        ["python3", SB, "POST", f"/v1/projects/{REF}/database/query", "--json", json.dumps({"query": query})],
        capture_output=True, text=True,
    )
    return json.loads(out.stdout) if out.stdout.strip().startswith("[") else out.stdout


def admin_api(method, path, body=None):
    # curl, bukan urllib: urllib lewat proxy sandbox tidak andal ke supabase.co
    # (IncompleteRead/RemoteDisconnected) — lihat AGENTS.md harness E2E.
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


def curl(jar, *args):
    cmd = ["curl", "-s", "--max-time", "90", "-c", jar, "-b", jar, "-o", "/tmp/e2e-cx-body.html", "-w", "%{http_code} %{redirect_url}"]
    cmd += list(args)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    body = open("/tmp/e2e-cx-body.html", encoding="utf-8", errors="ignore").read()
    parts = out.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


def login(jar, username):
    return curl(jar, "-X", "POST", "-d", f"username={username}&password={PW}", BASE + "/api/auth/login")


# ---------- Fixture: superadmin uji ----------
st, res = admin_api("POST", "/auth/v1/admin/users", {
    "email": "cx_sa@oms.internal", "password": PW, "email_confirm": True,
    "user_metadata": {"username": "cx_sa", "display_name": "CX SA"},
})
if st not in (200, 201):
    st2, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
    found = [u for u in lst.get("users", []) if u["email"] == "cx_sa@oms.internal"]
    assert found, (st, res)
    res = {"id": found[0]["id"]}
SA_ID = res["id"]
sql(f"insert into public.user_roles (user_id, role_id) select '{SA_ID}', id from public.roles where code='superadmin' on conflict do nothing")
sql(f"update public.profiles set must_change_password=false, active=true where id='{SA_ID}'")
check("Fixture cx_sa (superadmin) siap", True)

J = "/tmp/jar-cx-"
cx_id = None
try:
    code, loc, _ = login(J + "sa", "cx_sa")
    check("C1 login cx_sa 303", code == "303", loc)

    # Form buat akun memuat opsi custom
    _, _, body = curl(J + "sa", BASE + "/admin/users")
    check("C2 form buat akun memuat opsi custom", "custom — manual (semua mati)" in body)

    # Buat akun custom lewat route aplikasi yang sebenarnya
    code, loc, _ = curl(J + "sa", "-X", "POST",
                        "-d", "username=cx_user&display_name=CX User&role_code=custom&password=" + PW,
                        BASE + "/api/admin/users")
    check("C3 buat akun role custom diterima", "ok=dibuat" in loc, loc)

    rows = sql("select u.id from auth.users u where u.email='cx_user@oms.internal'")
    cx_id = rows[0]["id"] if rows else None
    assert cx_id, "cx_user tidak ditemukan"
    state = sql(f"""select
      (select r.code from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = '{cx_id}') as role_code,
      (select count(*)::int from public.user_module_access where user_id = '{cx_id}') as matrix_rows""")
    check("C4 role cx_user = custom", state[0]["role_code"] == "custom", str(state))
    check("C5 matriks cx_user kosong (0 baris)", state[0]["matrix_rows"] == 0, str(state))
    sql(f"update public.profiles set must_change_password=false, active=true where id='{cx_id}'")

    # Akun custom: login bisa, semua modul tertutup
    code, loc, _ = login(J + "u1", "cx_user")
    check("C6 login cx_user 303", code == "303", loc)
    _, _, body = curl(J + "u1", BASE + "/home")
    check("C7 Home tanpa tile modul apa pun",
          'href="/branding"' not in body and 'href="/claim"' not in body
          and 'href="/spm"' not in body and 'href="/workspace' not in body)
    _, _, body = curl(J + "u1", BASE + "/branding/bookings")
    # Halaman daftar memakai getSessionContext (shell tampil) dan datanya
    # dijaga RLS: yang dibuktikan di sini = TIDAK ADA data booking bocor.
    refs = sql("select reference_no from public.branding_bookings where reference_no is not null limit 5")
    leaked = [r["reference_no"] for r in refs if r["reference_no"] in body]
    check("C8 data booking TIDAK bocor untuk custom kosong (RLS)", not leaked, str(leaked))

    # Superadmin mencentang Branding (Read) lewat matriks.
    # Route matriks adalah snapshot PENUH (modul + fitur): fitur branding
    # harus ikut dikirim sebagai allowed, kalau tidak permission branding
    # ikut terpotong oleh penolakan fitur (perilaku 0012 yang sah).
    feat = "&".join(
        f"feat_{f}=on"
        for f in (
            "branding.overview", "branding.bookings", "branding.history",
            "branding.buses", "branding.pricing", "branding.documents", "branding.reports",
        )
    )
    code, loc, _ = curl(J + "sa", "-X", "POST", "-d", "read_branding=on&" + feat,
                        f"{BASE}/api/admin/users/{cx_id}/module-access")
    check("C9 simpan matriks (branding read) diterima", "ok=akses" in loc, loc)

    code, loc, _ = login(J + "u2", "cx_user")
    _, _, body = curl(J + "u2", BASE + "/home")
    check("C10 tile Branding tampil, Klaim tetap sembunyi",
          'href="/branding"' in body and 'href="/claim"' not in body)
    _, _, body = curl(J + "u2", BASE + "/branding/bookings")
    check("C11 /branding/bookings terbuka setelah dicentang", "Cari nomor lambung" in body)
finally:
    # ---------- Cleanup ----------
    for uid in (cx_id, SA_ID):
        if uid:
            admin_api("DELETE", f"/auth/v1/admin/users/{uid}")
    residue = sql("""select
      (select count(*)::int from auth.users where email in ('cx_sa@oms.internal','cx_user@oms.internal')) as users,
      (select count(*)::int from public.user_module_access where user_id not in (select id from auth.users)) as orphan_matrix""")
    check("C12 cleanup: user uji terhapus", residue[0]["users"] == 0, str(residue))

failed = [n for n, ok in results if not ok]
print(f"\n== {len(results) - len(failed)}/{len(results)} PASS ==")
if failed:
    print("GAGAL:", failed)
    raise SystemExit(1)
