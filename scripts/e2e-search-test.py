#!/usr/bin/env python3
"""E2E pencarian global + filter per modul melawan staging LIVE.
Fixture: superadmin search_sa + user branding-only search_br (matriks Fase 1).
Data acuan dibaca dari staging (nopol nyata, brand nyata, nomor klaim nyata).
"""
import json, urllib.request, urllib.parse, urllib.error, ssl, subprocess, sys
import http.cookiejar as cookiejar_mod

PW = "Uji12345"
BASE = "https://oms-staging.your-staging.workers.dev"
STG = "YOUR_PROJECT_REF"
CTX = ssl.create_default_context()
fails = []

def call(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)[:160]) if not cond else ""))
    if not cond: fails.append(name)

def api_sql(q):
    r = subprocess.run(["python3", "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py",
                        "POST", f"/v1/projects/{STG}/database/query", "--json", json.dumps({"query": q})],
                       capture_output=True, text=True, timeout=300)
    return json.loads(r.stdout[r.stdout.index("["):r.stdout.rindex("]") + 1])

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"

def http(jar, method, url, data=None):
    # curl untuk trafik aplikasi: urllib lewat proxy sandbox terbukti flaky
    # (IncompleteRead/RemoteDisconnected/403 UA) — curl stabil sepanjang malam ini.
    import time
    cmd = ["curl", "-sS", "--max-time", "120", "-A", UA, "-b", jar, "-c", jar,
           "-X", method, "-w", "\n%{http_code}"]
    if data:
        cmd += ["--data", data.decode()]
    cmd.append(url)
    last_err = ""
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        out = r.stdout
        if "\n" in out:
            body, _, code = out.rpartition("\n")
            if code.strip().isdigit():
                return int(code.strip()), body
        last_err = r.stderr[:200]
        time.sleep(3)
    raise RuntimeError(f"curl gagal: {last_err}")

def session():
    import tempfile, os
    fd, path = tempfile.mkstemp(prefix="e2e-cookies-", suffix=".txt")
    os.close(fd)
    return path


def login(op, username):
    return http(op, "POST", BASE + "/api/auth/login",
                f"username={username}&password={PW}".encode())[0]

# ---------- data acuan ----------
bus = api_sql("select no_polisi, fleet_no from public.branding_buses where fleet_no is not null limit 1")[0]
booking = api_sql("select brand_name from public.branding_bookings limit 1")[0]
claims = api_sql("select claim_number from public.claims limit 1")
claim_number = claims[0]["claim_number"] if claims else None
plate_token = bus["no_polisi"].split()[-1]  # angka unik nopol, mis. "7832"
brand_token = booking["brand_name"].split()[0]

def main():
    # fixture user lewat Auth Admin API (service key dari .env.local oms-fase1)
    env = {}
    for line in open("/home/hatch/workspace/oms-fase1/.env.local"):
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1); env[k] = v
    SUPA = env["NEXT_PUBLIC_SUPABASE_URL"]; SK = env["SUPABASE_SERVICE_ROLE_KEY"]
    def admin(method, path, body=None):
        import time
        for attempt in range(3):
            req = urllib.request.Request(SUPA + path, data=json.dumps(body).encode() if body else None, method=method)
            req.add_header("apikey", SK); req.add_header("Authorization", "Bearer " + SK)
            req.add_header("Content-Type", "application/json")
            try:
                with urllib.request.urlopen(req, timeout=60, context=CTX) as r: return r.status, json.loads(r.read() or b"{}")
            except urllib.error.HTTPError as e: return e.code, {}
            except Exception:
                if attempt == 2: raise
                time.sleep(3)
    ids = {}
    # Buat fixture via curl (urllib flaky di proxy). Idempoten: respons create
    # bisa hilang di tengah jalan padahal user SUDAH terbuat — maka sesudah
    # create, id selalu dipastikan lewat SQL, bukan dari respons API saja.
    def create_user_curl(email):
        payload = json.dumps({"email": email, "password": PW, "email_confirm": True})
        r = subprocess.run(["curl", "-sS", "--max-time", "60", "-X", "POST", SUPA + "/auth/v1/admin/users",
                            "-H", f"apikey: {SK}", "-H", f"Authorization: Bearer {SK}",
                            "-H", "Content-Type: application/json", "--data", payload],
                           capture_output=True, text=True, timeout=120)
        try: return json.loads(r.stdout).get("id")
        except Exception: return None
    for uname, supad in (("search_sa", True), ("search_br", False)):
        email = f"{uname}@oms.internal"
        uid = create_user_curl(email)
        if not uid:
            rows = api_sql(f"select id::text as id from auth.users where email='{email}'")
            uid = rows[0]["id"] if rows else None
        assert uid, f"create {uname} gagal total"
        ids[uname] = uid
        u = {"id": uid}
        api_sql(f"update public.profiles set must_change_password=false, active=true where id='{u['id']}';")
        if supad:
            api_sql(f"insert into public.user_roles (user_id, role_id) select '{u['id']}', id from public.roles where code='superadmin' on conflict do nothing;")
        else:
            api_sql(f"insert into public.user_module_access (user_id, module_code, can_read, can_write) values ('{u['id']}', 'branding', true, false) on conflict (user_id, module_code) do update set can_read=true;")

    sa = session(); call("S0 login superadmin", login(sa, "search_sa") in (200, 303))
    br = session(); call("S0b login branding-only", login(br, "search_br") in (200, 303))

    def search(op, q):
        st, body = http(op, "GET", BASE + "/api/search?q=" + urllib.parse.quote(q))
        try: return st, json.loads(body)
        except Exception: return st, {}

    st, res = search(sa, plate_token)
    groups = {g["key"]: g for g in res.get("groups", [])}
    call("S1 cari angka nopol -> grup armada berisi nopol tsb",
         st == 200 and "buses" in groups and any(bus["no_polisi"] in h["title"] for h in groups["buses"]["hits"]), str(res)[:200])

    st, res = search(sa, brand_token)
    groups = {g["key"]: g for g in res.get("groups", [])}
    call("S2 cari brand -> grup booking terisi",
         st == 200 and "bookings" in groups and len(groups["bookings"]["hits"]) > 0, str(res)[:200])

    if claim_number:
        st, res = search(sa, claim_number)
        groups = {g["key"]: g for g in res.get("groups", [])}
        call("S3 superadmin cari nomor klaim -> grup klaim terisi",
             st == 200 and "claims" in groups, str(res)[:200])
        st, res = search(br, claim_number)
        keys = [g["key"] for g in res.get("groups", [])]
        call("S4 branding-only TIDAK melihat klaim", "claims" not in keys, keys)
        st, res = search(br, plate_token)
        keys = [g["key"] for g in res.get("groups", [])]
        call("S5 branding-only tetap melihat armada", "buses" in keys, keys)

    anon = session()
    st, _ = http(anon, "GET", BASE + "/api/search?q=" + plate_token)
    call("S6 anonim ditolak 401", st == 401, st)

    # filter per modul: halaman booking ?q= nopol -> memuat brand pemilik nopol itu
    bk = api_sql(f"""select b.brand_name from public.branding_bookings b join public.branding_buses u on u.id=b.bus_id
                     where u.no_polisi='{bus["no_polisi"]}' limit 1""")
    if bk:
        st, body = http(sa, "GET", BASE + "/branding/bookings?q=" + urllib.parse.quote(bus["no_polisi"]))
        call("S7 halaman booking ?q=nopol memuat brand terkait", st == 200 and bk[0]["brand_name"] in body)
    st, body = http(sa, "GET", BASE + "/branding/buses?q=" + urllib.parse.quote(bus["no_polisi"]))
    call("S8 halaman armada ?q=nopol memuat nopol tsb", st == 200 and bus["no_polisi"] in body)
    st, body = http(sa, "GET", BASE + "/branding/buses?q=ZZZTIDAKADA123")
    call("S9 halaman armada ?q=ngawur tidak memuat nopol acuan", st == 200 and bus["no_polisi"] not in body)
    if claim_number:
        st, body = http(sa, "GET", BASE + "/claim/list?q=" + urllib.parse.quote(claim_number))
        call("S10 daftar klaim ?q=nomor memuat klaim tsb", st == 200 and claim_number in body)

    # halaman /search render
    st, body = http(sa, "GET", BASE + "/search?q=" + urllib.parse.quote(plate_token))
    call("S11 halaman /search merender hasil armada", st == 200 and bus["no_polisi"] in body)

    # revisi: saran API membawa keterangan (subtitle) untuk bus
    st, res = search(sa, plate_token)
    bus_hits = next((g["hits"] for g in res.get("groups", []) if g["key"] == "buses"), [])
    call("S13 saran bus membawa keterangan (lambung/jalur/tipe)",
         bool(bus_hits) and bool(bus_hits[0].get("subtitle")) and "·" in bus_hits[0]["subtitle"],
         bus_hits[:1])

    # revisi: spotlight entitas — cari nopol persis, kartu data bus muncul
    st, body = http(sa, "GET", BASE + "/search?q=" + urllib.parse.quote(bus["no_polisi"]))
    call("S14 spotlight bus tampil untuk nopol persis",
         st == 200 and "Hasil paling relevan" in body and "Nomor lambung" in body and bus["no_polisi"] in body)
    if bk:
        call("S15 spotlight memuat booking bus tsb", bk[0]["brand_name"] in body)

    # header memuat kotak pencarian global (komponen saran)
    st, body = http(sa, "GET", BASE + "/")
    call("S16 header memuat kotak pencarian global", st == 200 and "Cari nopol, brand, klaim" in body)

    # ralat: search khusus nomor lambung di halaman booking
    if bk:
        st, body = http(sa, "GET", BASE + "/branding/bookings?lambung=" + urllib.parse.quote(bus["fleet_no"]))
        call("S17 booking ?lambung= memuat brand bus tsb", st == 200 and bk[0]["brand_name"] in body)
        st, body = http(sa, "GET", BASE + "/branding/bookings?lambung=99999")
        call("S18 booking ?lambung=ngawur tidak memuat brand acuan", st == 200 and bk[0]["brand_name"] not in body)

    # ralat: Manajemen User tergabung di Setting, bukan seksi sendiri
    st, body = http(sa, "GET", BASE + "/")
    call("S19 Manajemen User di dalam grup Setting",
         st == 200 and 'href="/admin/users"' in body and '<div class="nav-label">Manajemen User</div>' not in body)

    # cleanup
    for uname, uid in ids.items():
        api_sql(f"delete from auth.users where id='{uid}';")
    left = api_sql("select count(*)::int c from public.profiles where username in ('search_sa','search_br')")[0]["c"]
    call("S12 residu fixture 0", left == 0, left)

try:
    main()
except Exception:
    import traceback; traceback.print_exc(); fails.append("exception")
print("\nHASIL:", "ALL PASS" if not fails else f"GAGAL: {fails}")
sys.exit(1 if fails else 0)
