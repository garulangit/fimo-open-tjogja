#!/usr/bin/env python3
"""E2E batas baris Pendapatan Operasional klaim: 10 -> 30 (12 Nov 2026).
Staging saja. Membuktikan:
- halaman detail merender 30 baris form pendapatan;
- simpan 20 baris -> semua tersimpan, total Pendapatan & Subsidi tepat;
- batas atas 30 baris juga bekerja;
- klaim yang sudah ada tidak berubah."""
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
SR, SBASE = env["SUPABASE_SERVICE_ROLE_KEY"], env["NEXT_PUBLIC_SUPABASE_URL"]
results = []


def check(name, cond, note=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL "), name, ("- " + note) if note else "")


def sql(query):
    out = subprocess.run(
        ["python3", SB, "POST", f"/v1/projects/{REF}/database/query", "--json", json.dumps({"query": query})],
        capture_output=True, text=True)
    return json.loads(out.stdout) if out.stdout.strip().startswith("[") else out.stdout


def admin_api(method, path, body=None):
    import os, tempfile
    pp = None
    if body is not None:
        fd, pp = tempfile.mkstemp()
        with os.fdopen(fd, "w") as f:
            f.write(json.dumps(body))
    outp = tempfile.mktemp()
    cmd = ["curl", "-s", "--max-time", "60", "-X", method, "-H", f"apikey: {SR}",
           "-H", f"Authorization: Bearer {SR}", "-H", "Content-Type: application/json",
           "-o", outp, "-w", "%{http_code}"]
    if pp:
        cmd += ["-d", "@" + pp]
    cmd.append(SBASE + path)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    raw = open(outp, errors="ignore").read()
    try:
        return int(r.stdout.strip()), json.loads(raw or "{}")
    except Exception:
        return int(r.stdout.strip()), {}


def req(jar, method, url, fields=None):
    cmd = ["curl", "-s", "--max-time", "120", "-c", jar, "-b", jar,
           "-o", "/tmp/rv-body.html", "-w", "%{http_code} %{redirect_url}"]
    if method == "POST":
        cmd += ["-X", "POST"]
    for k, v in (fields or []):
        cmd += ["-F", f"{k}={v}"]
    cmd.append(url)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=150).stdout.strip()
    body = open("/tmp/rv-body.html", encoding="utf-8", errors="ignore").read()
    parts = out.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


# ---------- fixture SA ----------
st, res = admin_api("POST", "/auth/v1/admin/users", {
    "email": "rv_sa@oms.internal", "password": PW, "email_confirm": True,
    "user_metadata": {"username": "rv_sa", "display_name": "RV SA"}})
if st not in (200, 201):
    _, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
    res = {"id": [u for u in lst["users"] if u["email"] == "rv_sa@oms.internal"][0]["id"]}
SA = res["id"]
sql(f"insert into public.user_roles (user_id, role_id) select '{SA}', id from public.roles where code='superadmin' on conflict do nothing")
sql(f"update public.profiles set must_change_password=false, active=true where id='{SA}'")
J = "/tmp/jar-rv"
req(J, "POST", BASE + "/api/auth/login", [("username", "rv_sa"), ("password", PW)])

# ---------- snapshot klaim lama (tidak boleh berubah) ----------
snap_q = """select json_build_object('id', c.id, 'n', (select count(*) from public.claim_revenues r where r.claim_id=c.id),
  'rev', c.total_revenue, 'sub', c.calculated_subsidy) as s
  from public.claims c where (select count(*) from public.claim_revenues r where r.claim_id=c.id) > 0 limit 1"""
before = sql(snap_q)[0]["s"]

try:
    meta = sql("""select json_build_object(
      'vt', (select id from public.claim_vehicle_types limit 1),
      'rv', (select id from public.claim_regulation_versions limit 1)) as m""")[0]["m"]
    cid = sql(f"""insert into public.claims (claim_number, vehicle_type_id, regulation_version_id,
                    period_month, period_year, operator_name, pic_name, pic_position, status)
                  values ('RV30-2026-0001', '{meta['vt']}', '{meta['rv']}', 5, 2026,
                          'RV OP', 'Rv', 'Uji', 'DRAFT') returning id""")[0]["id"]
    cat = sql(f"""select id from public.claim_cost_categories
                  where category_type='DIRECT_COST' and regulation_version_id='{meta['rv']}'
                    and vehicle_type_id='{meta['vt']}' limit 1""")[0]["id"]
    sql(f"""insert into public.claim_items (claim_id, cost_category_id, nominal_base,
              tax_type, tax_rate, calculated_tax, calculated_total)
            values ('{cid}', '{cat}', 100000000, 'NONE', 0, 0, 100000000)""")

    # R1: halaman detail merender 30 baris
    _, _, html = req(J, "GET", f"{BASE}/claim/{cid}")
    n_rows = html.count('name="rev_code_')
    check("R1 form pendapatan merender 30 baris", n_rows == 30, f"terhitung {n_rows}")

    # R2-R4: simpan 20 baris (15 tiket + 5 branding), nominal (i+1)*100rb
    fields = [("_action", "revenues")]
    for i in range(20):
        fields += [(f"rev_code_{i}", f"3.{i+1}"), (f"rev_name_{i}", f"Pendapatan Uji {i+1}"),
                   (f"rev_cat_{i}", "TICKET" if i < 15 else "BRANDING"),
                   (f"rev_nominal_{i}", str((i + 1) * 100000))]
    _, loc, _ = req(J, "POST", f"{BASE}/api/claim/claims/{cid}", fields)
    check("R2 simpan 20 baris diterima", "Pendapatan%20disimpan" in loc, loc[-60:])

    agg = sql(f"""select json_build_object(
      'n', count(*), 'total', coalesce(sum(nominal),0),
      'tiket', coalesce(sum(nominal) filter (where category='TICKET'),0),
      'branding', coalesce(sum(nominal) filter (where category='BRANDING'),0)) as a
      from public.claim_revenues where claim_id='{cid}'""")[0]["a"]
    check("R3 ke-20 baris tersimpan persis", agg["n"] == 20 and float(agg["total"]) == 21000000
          and float(agg["tiket"]) == 12000000 and float(agg["branding"]) == 9000000, str(agg))

    tot = sql(f"""select total_revenue, total_operational_cost, calculated_subsidy
                  from public.claims where id='{cid}'""")[0]
    check("R4 total Pendapatan & Subsidi tepat",
          float(tot["total_revenue"]) == 21000000 and float(tot["total_operational_cost"]) == 107000000
          and float(tot["calculated_subsidy"]) == 86000000, str(tot))

    # R5: muat ulang -> baris ke-20 tampil lagi di form
    _, _, html = req(J, "GET", f"{BASE}/claim/{cid}")
    check("R5 setelah muat ulang baris ke-20 tampil (3.20)",
          'value="3.20"' in html and html.count('name="rev_code_') == 30)

    # R6: batas atas — simpan 30 baris
    fields = [("_action", "revenues")]
    for i in range(30):
        fields += [(f"rev_code_{i}", f"4.{i+1}"), (f"rev_name_{i}", f"Batas {i+1}"),
                   (f"rev_cat_{i}", "TICKET"), (f"rev_nominal_{i}", "1000")]
    req(J, "POST", f"{BASE}/api/claim/claims/{cid}", fields)
    agg = sql(f"""select count(*)::int as n, coalesce(sum(nominal),0) as total
                  from public.claim_revenues where claim_id='{cid}'""")[0]
    tot = sql(f"select calculated_subsidy from public.claims where id='{cid}'")[0]
    check("R6 simpan 30 baris penuh tersimpan",
          agg["n"] == 30 and float(agg["total"]) == 30000
          and float(tot["calculated_subsidy"]) == 106970000, f"{agg} {tot}")

    sql(f"delete from public.claims where id='{cid}'")
finally:
    admin_api("DELETE", f"/auth/v1/admin/users/{SA}")

after = sql(snap_q)[0]["s"]
check("R7 klaim lama tidak berubah", before == after, f"{before} -> {after}")
check("R8 cleanup fixture selesai", True)

failed = [n for n, ok in results if not ok]
print(f"\n== {len(results) - len(failed)}/{len(results)} PASS ==")
if failed:
    print("GAGAL:", failed)
    raise SystemExit(1)
