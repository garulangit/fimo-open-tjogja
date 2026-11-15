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
    for uname, supad in (("nego_sa", True), ("nego_br", False)):
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
            api_sql(f"insert into public.user_module_access (user_id, module_code, can_read, can_write) values ('{uid}', 'branding', true, false) on conflict (user_id, module_code) do update set can_read=true;")

    sa, lim = session(), session()
    call("S0 login SA", login(sa, "nego_sa") in (200, 303))
    call("S0b login branding-only", login(lim, "nego_br") in (200, 303))

    # Kloning satu booking nyata -> transaksi uji tersendiri
    cols = [r["column_name"] for r in api_sql(
        "select column_name from information_schema.columns where table_schema='public' and table_name='branding_bookings' order by ordinal_position")]
    tid = str(uuid.uuid4())
    # Kloning memakai bus bebas + periode 2031 agar tidak kena trigger konflik booking.
    free_bus = api_sql("select id::text as id, no_polisi, fleet_no, hull_no, route, bus_type from public.branding_buses "
                       "where id not in (select bus_id from public.branding_bookings) limit 1")
    fb = free_bus[0] if free_bus else api_sql("select id::text as id, no_polisi, fleet_no, hull_no, route, bus_type from public.branding_buses limit 1")[0]
    q = lambda v: "'" + str(v).replace("'", "''") + "'" if v is not None else "null"
    sel = []
    for c in cols:
        if c == "id": sel.append(f"'{uuid.uuid4()}'::uuid as id")
        elif c == "transaction_id": sel.append(f"'{tid}'::uuid as transaction_id")
        elif c == "reference_no": sel.append("'REF-UJI-NEGO' as reference_no")
        elif c == "brand_name": sel.append("'UJI-NEGO-BRAND' as brand_name")
        elif c == "company_name": sel.append("'PT Uji Nego E2E' as company_name")
        elif c == "bus_id": sel.append(f"'{fb['id']}'::uuid as bus_id")
        elif c == "start_date": sel.append("'2031-01-01'::date as start_date")
        elif c == "end_date": sel.append("'2031-03-31'::date as end_date")
        elif c == "bus_no_polisi_snapshot": sel.append(f"{q(fb['no_polisi'])} as bus_no_polisi_snapshot")
        elif c == "bus_fleet_no_snapshot": sel.append(f"{q(fb['fleet_no'])} as bus_fleet_no_snapshot")
        elif c == "bus_hull_no_snapshot": sel.append(f"{q(fb['hull_no'])} as bus_hull_no_snapshot")
        elif c == "bus_route_snapshot": sel.append(f"{q(fb['route'])} as bus_route_snapshot")
        elif c == "bus_type_snapshot": sel.append(f"{q(fb['bus_type'])} as bus_type_snapshot")
        else: sel.append(c)
    ins = api_sql(f"insert into public.branding_bookings ({', '.join(cols)}) select {', '.join(sel)} "
                  f"from public.branding_bookings where transaction_id is not null and pricing_snapshot is not null limit 1 "
                  f"returning transaction_id::text as tid, (pricing_snapshot->>'totalWithPpn')::numeric as total")
    total = float(ins[0]["total"]) if ins else 0
    # Trigger branding_assign_transaction_group menentukan grup dari atribut —
    # kunci grup yang sah adalah transaction_id hasil insert, bukan tebakan kita.
    key = ins[0]["tid"] if ins else tid
    call("O0 kloning booking uji", total > 0 and bool(key), f"total={total}")
    rp = lambda n: "Rp " + f"{round(n):,}".replace(",", ".")

    st, body = http(sa, "GET", BASE + "/branding/bookings?q=UJI-NEGO-BRAND")
    call("O1 SA melihat tombol Override Total", st == 200 and "Override Total" in body)
    st, body = http(lim, "GET", BASE + "/branding/bookings?q=UJI-NEGO-BRAND")
    call("O2 user tanpa grant tidak melihat tombol", st == 200 and "Override Total" not in body)
    st, _ = http_json(lim, BASE + "/api/branding/adjustments",
                      {"transaction_key": key, "adjusted_total": total * 0.9, "reason": "uji ditolak"})
    call("O2b API menolak tanpa grant (403)", st == 403)

    feats = ["branding.overview", "branding.bookings", "branding.buses", "branding.documents", "branding.reports", "branding.override"]
    form = {"read_branding": "on", "write_branding": "on", **{f"feat_{f}": "on" for f in feats}}
    st, _ = http(sa, "POST", BASE + f"/api/admin/users/{ids['nego_br']}/module-access",
                 urllib.parse.urlencode(form).encode())
    call("O3 grant override via matriks tersimpan", st in (200, 303), f"st={st}")
    st, body = http(lim, "GET", BASE + "/branding/bookings?q=UJI-NEGO-BRAND")
    call("O3b tombol muncul setelah grant", st == 200 and "Override Total" in body)

    st, _ = http_json(lim, BASE + "/api/branding/adjustments",
                      {"transaction_key": key, "adjusted_total": total * 0.9, "reason": "Uji nego E2E"})
    call("O4 simpan nego 90%", st == 200, f"st={st}")
    st, body = http(sa, "GET", BASE + "/branding/bookings?q=UJI-NEGO-BRAND")
    call("O4b total grup tampil 90% + lencana Nego", rp(total * 0.9) in body and "Nego" in body)

    st, body = http(sa, "GET", BASE + "/branding/reports")
    call("O5 laporan memuat total efektif", st == 200 and rp(total * 0.9) in body)

    st, _ = http_json(lim, BASE + "/api/branding/adjustments",
                      {"transaction_key": key, "adjusted_total": total * 0.5, "reason": "   "})
    call("O6 alasan kosong ditolak (400)", st == 400)

    st, _ = http_json(lim, BASE + "/api/branding/adjustments",
                      {"transaction_key": key, "adjusted_total": total * 0.8, "reason": "Revisi nego E2E"})
    st2, body = http(sa, "GET", BASE + "/branding/bookings?q=UJI-NEGO-BRAND")
    call("O7 nego terbaru 80% berlaku", st == 200 and rp(total * 0.8) in body)

    # Kloning kedua: bus bebas LAIN (bus pertama sudah terpakai di periode sama
    # -> trigger konflik), atribut grup tetap sama agar satu transaksi.
    fb2 = api_sql("select id::text as id, no_polisi, fleet_no, hull_no, route, bus_type from public.branding_buses "
                  "where id not in (select bus_id from public.branding_bookings) limit 1")[0]
    sel2 = []
    for c in cols:
        if c == "id": sel2.append(f"'{uuid.uuid4()}'::uuid as id")
        elif c == "transaction_id": sel2.append(f"'{tid}'::uuid as transaction_id")
        elif c == "reference_no": sel2.append("'REF-UJI-NEGO' as reference_no")
        elif c == "brand_name": sel2.append("'UJI-NEGO-BRAND' as brand_name")
        elif c == "company_name": sel2.append("'PT Uji Nego E2E' as company_name")
        elif c == "bus_id": sel2.append(f"'{fb2['id']}'::uuid as bus_id")
        elif c == "start_date": sel2.append("'2031-01-01'::date as start_date")
        elif c == "end_date": sel2.append("'2031-03-31'::date as end_date")
        elif c == "bus_no_polisi_snapshot": sel2.append(f"{q(fb2['no_polisi'])} as bus_no_polisi_snapshot")
        elif c == "bus_fleet_no_snapshot": sel2.append(f"{q(fb2['fleet_no'])} as bus_fleet_no_snapshot")
        elif c == "bus_hull_no_snapshot": sel2.append(f"{q(fb2['hull_no'])} as bus_hull_no_snapshot")
        elif c == "bus_route_snapshot": sel2.append(f"{q(fb2['route'])} as bus_route_snapshot")
        elif c == "bus_type_snapshot": sel2.append(f"{q(fb2['bus_type'])} as bus_type_snapshot")
        else: sel2.append(c)
    ins2 = api_sql(f"insert into public.branding_bookings ({', '.join(cols)}) select {', '.join(sel2)} "
                   f"from public.branding_bookings where transaction_id is not null and pricing_snapshot is not null limit 1 returning transaction_id::text as tid")
    st, body = http(sa, "GET", BASE + "/branding/bookings?q=UJI-NEGO-BRAND")
    call("O8 kunci rasio: total ikut data (2 bus x 80%)", bool(ins2) and ins2[0]["tid"] == key and rp(total * 2 * 0.8) in body)

    st, _ = http_json(lim, BASE + "/api/branding/adjustments", {"transaction_key": key, "action": "remove"})
    st2, body = http(sa, "GET", BASE + "/branding/bookings?q=UJI-NEGO-BRAND")
    call("O9 cabut: total kembali 100%", st == 200 and rp(total * 2) in body)

    aud = api_sql("select count(*)::int as n from public.audit_events where action like 'branding.total_override.%'")
    call("O10 audit override tercatat", (aud[0]["n"] if aud else 0) >= 3)

    api_sql(f"delete from public.branding_total_adjustments where transaction_key='{key}';")
    api_sql(f"delete from public.branding_bookings where transaction_id='{key}';")
    api_sql("delete from public.branding_bookings where brand_name='UJI-NEGO-BRAND';")
    left = api_sql(f"select (select count(*) from public.branding_bookings where transaction_id='{key}') + "
                   f"(select count(*) from public.branding_total_adjustments where transaction_key='{key}') as n")
    call("O11 residu data uji 0", (left[0]["n"] if left else -1) == 0)

    for uid in ids.values():
        api_sql(f"delete from auth.users where id='{uid}';")
    res = api_sql("select count(*)::int as n from public.profiles where username like 'nego_%'")
    call("O12 residu fixture 0", (res[0]["n"] if res else -1) == 0)

    print()
    bad = [r for r in RESULTS if not r[1]]
    print("HASIL:", "ALL PASS" if not bad else f"{len(bad)} GAGAL")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
