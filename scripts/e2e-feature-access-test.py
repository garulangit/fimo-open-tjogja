#!/usr/bin/env python3
"""E2E revisi akses per fitur (migration 0012) melawan staging LIVE.
- feat_sa   : superadmin (pembuat konfigurasi + pembanding akses penuh)
- feat_user : branding R/W + claim Read; fitur claim.verify & claim.master DITOLAK,
              branding.reports DITOLAK — lewat API matriks yang asli.
- feat_none : tanpa akses sama sekali -> navigasinya harus kosong dari modul.
Trafik aplikasi via curl (urllib flaky lewat proxy sandbox).
"""
import json, subprocess, sys, tempfile, os, time

PW = "Uji12345"
BASE = "https://oms-staging.your-staging.workers.dev"
STG = "YOUR_PROJECT_REF"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
fails = []

def call(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)[:200]) if not cond else ""))
    if not cond: fails.append(name)

def api_sql(q):
    r = subprocess.run(["python3", "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py",
                        "POST", f"/v1/projects/{STG}/database/query", "--json", json.dumps({"query": q})],
                       capture_output=True, text=True, timeout=300)
    return json.loads(r.stdout[r.stdout.index("["):r.stdout.rindex("]") + 1])

def http(jar, method, url, data=None, follow=True):
    cmd = ["curl", "-sS", "--max-time", "120", "-A", UA, "-b", jar, "-c", jar, "-X", method, "-w", "\n%{http_code}"]
    if follow: cmd.insert(2, "-L")
    if data: cmd += ["--data", data]
    cmd.append(url)
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        out = r.stdout
        if "\n" in out:
            body, _, code = out.rpartition("\n")
            if code.strip().isdigit(): return int(code.strip()), body
        time.sleep(3)
    raise RuntimeError("curl gagal: " + r.stderr[:200])

def session():
    fd, path = tempfile.mkstemp(prefix="feat-cookies-", suffix=".txt"); os.close(fd); return path

def login(jar, username):
    return http(jar, "POST", BASE + "/api/auth/login", f"username={username}&password={PW}")[0]

env = {}
for line in open("/home/hatch/workspace/oms-fase1/.env.local"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1); env[k] = v
SUPA, SK = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]

def create_user(email):
    payload = json.dumps({"email": email, "password": PW, "email_confirm": True})
    r = subprocess.run(["curl", "-sS", "--max-time", "60", "-X", "POST", SUPA + "/auth/v1/admin/users",
                        "-H", f"apikey: {SK}", "-H", f"Authorization: Bearer {SK}",
                        "-H", "Content-Type: application/json", "--data", payload],
                       capture_output=True, text=True, timeout=120)
    try: uid = json.loads(r.stdout).get("id")
    except Exception: uid = None
    if not uid:
        rows = api_sql(f"select id::text as id from auth.users where email='{email}'")
        uid = rows[0]["id"] if rows else None
    return uid

def main():
    ids = {}
    for uname, supad in (("feat_sa", True), ("feat_user", False), ("feat_none", False)):
        email = f"{uname}@oms.internal"
        uid = create_user(email)
        assert uid, f"create {uname} gagal"
        ids[uname] = uid
        api_sql(f"update public.profiles set must_change_password=false, active=true where id='{uid}';")
        if supad:
            api_sql(f"insert into public.user_roles (user_id, role_id) select '{uid}', id from public.roles where code='superadmin' on conflict do nothing;")

    sa = session(); call("F0 login superadmin", login(sa, "feat_sa") in (200, 303))

    # Konfigurasi feat_user lewat API matriks asli (form POST seperti UI).
    fields = {
        "read_branding": "on", "write_branding": "on", "read_claim": "on",
        # fitur branding: semua on KECUALI reports
        "feat_branding.overview": "on", "feat_branding.bookings": "on", "feat_branding.history": "on",
        "feat_branding.buses": "on", "feat_branding.pricing": "on", "feat_branding.documents": "on",
        # fitur claim: overview/list/create on; verify & master DITOLAK (tidak dikirim); reports on
        "feat_claim.overview": "on", "feat_claim.list": "on", "feat_claim.create": "on", "feat_claim.reports": "on",
        # fitur spm/workspace tidak relevan (modul mati) — kirim on agar netral
        "feat_spm.overview": "on", "feat_spm.reconciliation": "on", "feat_spm.penalties": "on", "feat_spm.rates": "on",
        "feat_workspace.applications": "on", "feat_workspace.drive": "on",
    }
    data = "&".join(f"{k}={v}" for k, v in fields.items())
    st, _ = http(sa, "POST", f"{BASE}/api/admin/users/{ids['feat_user']}/module-access", data)
    call("F1 simpan matriks+fitur via API", st in (200, 303), st)

    # Snapshot penuh: semua kode fitur tersimpan; yang tidak dikirim = ditolak.
    # Dulu ekspektasinya hitungan persis 3, tetapi registri fitur bertambah
    # (branding.override + shortcut workspace per aplikasi) sehingga hitungan
    # absolut tidak stabil. Yang bermakna: 3 fitur yang sengaja ditolak memang
    # tertolak, dan tidak ada fitur yang dikirim "on" ikut tertolak.
    rows = api_sql(f"select feature_code from public.user_feature_access where user_id='{ids['feat_user']}' and not allowed")
    denied = {r["feature_code"] for r in rows}
    must_deny = {"branding.reports", "claim.verify", "claim.master"}
    sent_on = {k[5:] for k in fields if k.startswith("feat_")}
    call("F2 baris fitur tertolak tersimpan (reports, verify, master)",
         must_deny <= denied and not (denied & sent_on), sorted(denied))

    fu = session(); call("F3 login feat_user", login(fu, "feat_user") in (200, 303))
    st, home = http(fu, "GET", BASE + "/")
    call("F4 nav feat_user memuat Branding & Klaim",
         st == 200 and 'href="/branding/bookings"' in home and 'href="/claim/list"' in home)
    call("F5 nav feat_user TIDAK memuat Verifikasi & Master Data Klaim",
         'href="/claim/verify"' not in home and 'href="/claim/master"' not in home)
    call("F6 nav feat_user TIDAK memuat Laporan Branding",
         'href="/branding/reports"' not in home)

    st, body = http(fu, "GET", BASE + "/claim/verify")
    call("F7 halaman /claim/verify tertolak (permission dicabut)",
         "Antrean Verifikasi" not in body)
    st, body = http(fu, "GET", BASE + "/claim/master")
    call("F8 halaman /claim/master tertolak", "Jenis Kendaraan" not in body)
    st, body = http(fu, "GET", BASE + "/claim/list")
    call("F9 halaman /claim/list tetap bisa dibuka", st == 200 and "Klaim" in body)

    fn = session(); call("F10 login feat_none", login(fn, "feat_none") in (200, 303))
    st, home = http(fn, "GET", BASE + "/")
    call("F11 akun tanpa akses: tidak ada grup modul di nav",
         st == 200 and 'href="/branding/bookings"' not in home and 'href="/claim/list"' not in home
         and 'href="/claim/verify"' not in home)
    call("F12 dashboard tanpa seksi kartu MODUL (sudah dihapus)",
         "Dalam pembangunan" not in home)

    st, body = http(sa, "GET", BASE + "/claim/verify")
    call("F13 superadmin tetap bisa membuka verifikasi",
         "Antrean Verifikasi" in body)
    st, home = http(sa, "GET", BASE + "/")
    call("F14 nav superadmin lengkap", 'href="/claim/verify"' in home and 'href="/branding/reports"' in home)

    for uid in ids.values():
        api_sql(f"delete from auth.users where id='{uid}';")
    left = api_sql("select count(*)::int c from public.profiles where username in ('feat_sa','feat_user','feat_none')")[0]["c"]
    call("F15 residu fixture 0", left == 0, left)

try:
    main()
except Exception:
    import traceback; traceback.print_exc(); fails.append("exception")
print("\nHASIL:", "ALL PASS" if not fails else f"GAGAL: {fails}")
sys.exit(1 if fails else 0)
