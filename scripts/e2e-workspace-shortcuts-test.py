#!/usr/bin/env python3
"""E2E Override Total (nego, kunci rasio) — staging. Pola harness curl."""
import json, subprocess, sys, urllib.parse, uuid

BASE = "https://oms-staging.your-staging.workers.dev"
REF = "YOUR_PROJECT_REF"
PW = "Uji12345"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
RESULTS = []

def call(name, cond, extra=""):
    RESULTS.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" [{extra}]" if extra and not cond else ""))

def api_sql(q):
    r = subprocess.run(["python3", "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py",
                        "POST", f"/v1/projects/{REF}/database/query", "--json", json.dumps({"query": q})],
                       capture_output=True, text=True, timeout=300)
    return json.loads(r.stdout) if r.stdout.strip().startswith("[") else []

def http(jar, method, url, data=None):
    import time
    cmd = ["curl", "-sS", "--max-time", "120", "-A", UA, "-b", jar, "-c", jar,
           "-X", method, "-w", "\n%{http_code}"]
    if data:
        cmd += ["--data", data.decode()]
    cmd.append(url)
    last = ""
    for _ in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        out = r.stdout
        if "\n" in out:
            body, _, code = out.rpartition("\n")
            if code.strip().isdigit():
                return int(code.strip()), body
        last = r.stderr[:200]
        time.sleep(3)
    raise RuntimeError(f"curl gagal: {last}")

def http_json(jar, url, payload):
    import time
    cmd = ["curl", "-sS", "--max-time", "120", "-A", UA, "-b", jar, "-c", jar,
           "-X", "POST", "-H", "Content-Type: application/json",
           "--data", json.dumps(payload), "-w", "\n%{http_code}", url]
    for _ in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        out = r.stdout
        if "\n" in out:
            body, _, code = out.rpartition("\n")
            if code.strip().isdigit():
                return int(code.strip()), body
        time.sleep(3)
    raise RuntimeError("curl json gagal")

def session():
    import tempfile, os
    fd, path = tempfile.mkstemp(prefix="e2e-nego-", suffix=".txt")
    os.close(fd)
    return path

def login(jar, username):
    return http(jar, "POST", BASE + "/api/auth/login",
                f"username={username}&password={PW}".encode())[0]

def main():
    env = {}
    for line in open("/home/hatch/workspace/oms-fase1/.env.local"):
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1); env[k] = v
    SUPA, SK = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]

    def create_user_curl(email):
        payload = json.dumps({"email": email, "password": PW, "email_confirm": True})
        r = subprocess.run(["curl", "-sS", "--max-time", "60", "-X", "POST", SUPA + "/auth/v1/admin/users",
                            "-H", f"apikey: {SK}", "-H", f"Authorization: Bearer {SK}",
                            "-H", "Content-Type: application/json", "--data", payload],
                           capture_output=True, text=True, timeout=120)
        try: return json.loads(r.stdout).get("id")
        except Exception: return None

    ids = {}
    for uname, supad in (("wsc_sa", True), ("wsc_ws", False)):
        email = f"{uname}@oms.internal"
        uid = create_user_curl(email)
        if not uid:
            rows = api_sql(f"select id::text as id from auth.users where email='{email}'")
            uid = rows[0]["id"] if rows else None
        assert uid, f"create {uname} gagal"
        ids[uname] = uid
        api_sql(f"update public.profiles set must_change_password=false, active=true where id='{uid}';")
        if supad:
            api_sql(f"insert into public.user_roles (user_id, role_id) select '{uid}', id from public.roles where code='superadmin' on conflict do nothing;")
        else:
            api_sql(f"insert into public.user_module_access (user_id, module_code, can_read, can_write) values ('{uid}', 'workspace', true, false) on conflict (user_id, module_code) do update set can_read=true;")

    sa, ws = session(), session()
    call("S0 login SA", login(sa, "wsc_sa") in (200, 303))
    call("S0b login workspace-only", login(ws, "wsc_ws") in (200, 303))

    # bawaan: semua shortcut tampil
    st, body = http(ws, "GET", BASE + "/workspace/applications")
    call("W1 bawaan: GPS App tampil", st == 200 and "GPS App" in body and "ERP" in body)
    st, body = http(ws, "GET", BASE + "/workspace/drive")
    call("W2 bawaan: Data Bus tampil", st == 200 and "Data Bus Angkutan Perkotaan" in body)

    # matriks: matikan GPS App + Data Bus untuk user ini (shortcut lain tetap on)
    feats = ["workspace.applications", "workspace.drive",
             "workspace.app.ticketing", "workspace.app.fms", "workspace.app.cctv",
             "workspace.app.fuel", "workspace.app.mail", "workspace.app.erp", "workspace.app.crm",
             "workspace.drive.peta-transum", "workspace.drive.template-pengalihan", "workspace.drive.berkas-branding"]
    form = {"read_workspace": "on", **{f"feat_{f}": "on" for f in feats}}
    st, _ = http(sa, "POST", BASE + f"/api/admin/users/{ids['wsc_ws']}/module-access",
                 urllib.parse.urlencode(form).encode())
    call("W3 simpan matriks (2 shortcut mati)", st in (200, 303), f"st={st}")
    rows = api_sql(f"select feature_code from public.user_feature_access where user_id='{ids['wsc_ws']}' and not allowed order by 1")
    denied = {r["feature_code"] for r in rows}
    # Form uji hanya mengirim fitur workspace; snapshot rute mencatat fitur
    # modul lain sebagai tertolak (UI asli mengirim semua switch). Yang
    # diperiksa: dua shortcut sasaran tertolak, shortcut yang dipertahankan tidak.
    call("W4 baris tertolak memuat gps + data-bus, bukan erp/peta",
         {"workspace.app.gps", "workspace.drive.data-bus"} <= denied
         and "workspace.app.erp" not in denied and "workspace.drive.peta-transum" not in denied,
         str(denied))

    st, body = http(ws, "GET", BASE + "/workspace/applications")
    call("W5 GPS App hilang, ERP tetap", st == 200 and "GPS App" not in body and "ERP" in body)
    st, body = http(ws, "GET", BASE + "/workspace/drive")
    call("W6 Data Bus hilang, Peta tetap", st == 200 and "Data Bus Angkutan Perkotaan" not in body and "Peta Transum Jogja" in body)

    # pencarian global ikut menyembunyikan shortcut tertolak
    st, body = http(ws, "GET", BASE + "/api/search?q=" + urllib.parse.quote("GPS"))
    call("W7 search tidak menawarkan GPS App", st == 200 and "GPS App" not in body)
    st, body = http(sa, "GET", BASE + "/api/search?q=" + urllib.parse.quote("GPS"))
    call("W8 SA tetap menemukan GPS App", st == 200 and "GPS App" in body)

    for uid in ids.values():
        api_sql(f"delete from auth.users where id='{uid}';")
    res = api_sql("select count(*)::int as n from public.profiles where username like 'wsc_%'")
    call("W9 residu fixture 0", (res[0]["n"] if res else -1) == 0)

    print()
    bad = [r for r in RESULTS if not r[1]]
    print("HASIL:", "ALL PASS" if not bad else f"{len(bad)} GAGAL")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
