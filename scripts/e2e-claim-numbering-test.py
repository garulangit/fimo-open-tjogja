#!/usr/bin/env python3
"""E2E penomoran klaim — staging.
Reproduksi persis kegagalan production 12 Nov: seri CLM-D-2026 berisi
0001..0005, satu klaim di tengah dihapus (celah; COUNT=4, MAX=5) —
kode lama menghitung COUNT+1=0005 -> duplicate key selamanya.
Kode baru (MAX+1 + retry) harus memberi 0006, 0007, 0008 berurutan
tanpa tabrakan. Ekspektasi dihitung relatif dari baseline agar suite
aman diulang; pada keadaan staging saat ini baseline = [0001] sehingga
angka literalnya persis 0006/0007/0008 setelah celah dibuat."""
import json
import re
import subprocess
import urllib.parse

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
           "-o", "/tmp/nm-body.html", "-w", "%{http_code} %{redirect_url}"]
    if method == "POST":
        cmd += ["-X", "POST"]
    for k, v in (fields or []):
        cmd += ["-F", f"{k}={v}"]
    cmd.append(url)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=150).stdout.strip()
    parts = out.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else "")


# --- fixture user (superadmin) ---
st, res = admin_api("POST", "/auth/v1/admin/users", {
    "email": "nm_sa@oms.internal", "password": PW, "email_confirm": True,
    "user_metadata": {"username": "nm_sa", "display_name": "NM SA"}})
if st not in (200, 201):
    _, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
    res = {"id": [u for u in lst["users"] if u["email"] == "nm_sa@oms.internal"][0]["id"]}
SA = res["id"]
sql(f"insert into public.user_roles (user_id, role_id) select '{SA}', id from public.roles where code='superadmin' on conflict do nothing")
sql(f"update public.profiles set must_change_password=false, active=true where id='{SA}'")
J = "/tmp/jar-nm"
req(J, "POST", BASE + "/api/auth/login", [("username", "nm_sa"), ("password", PW)])

# --- meta dari klaim seri yang sudah ada (prefix sama persis) ---
meta = sql("""select json_build_object(
  'vt', (select vehicle_type_id from public.claims where claim_number like 'CLM-D-2026-%' limit 1),
  'rv', (select regulation_version_id from public.claims where claim_number like 'CLM-D-2026-%' limit 1)) as m""")[0]["m"]
PREFIX = "CLM-D-2026-"


def series():
    rows = sql(f"select claim_number from public.claims where claim_number like '{PREFIX}%' order by claim_number")
    return [r["claim_number"] for r in rows]


def seq_of(number):
    return int(number[len(PREFIX):])


def create_claim(operator):
    st, loc = req(J, "POST", BASE + "/api/claim/claims", [
        ("vehicle_type_id", meta["vt"]), ("regulation_version_id", meta["rv"]),
        ("period_month", "3"), ("period_year", "2026"),
        ("operator_name", operator), ("pic_name", "NM"), ("pic_position", "Uji"),
        ("profit_percentage", "7")])
    m = re.search(r"Klaim%20(CLM-D-2026-\d+)%20dibuat", loc)
    err = "err=" in loc
    return (m.group(1) if m else None), err, loc


base = series()
base_max = max((seq_of(n) for n in base), default=0)
check("S0 baseline seri terbaca", len(base) >= 1, f"baseline={base}")

# --- Fase 1: buat 4 klaim berurutan (meniru pertumbuhan seri production) ---
made = []
ok = True
for i in range(4):
    num, err, _ = create_claim("PT Uji Penomoran")
    want = f"{PREFIX}{base_max + 1 + i:04d}"
    ok = ok and (num == want) and not err
    made.append(num)
check("S1 empat klaim berurutan tanpa tabrakan", ok, f"hasil={made}")

# --- Fase 2: hapus satu klaim di tengah (celah, meniru hapus dummy 0001) ---
victim = made[1]
sql(f"delete from public.claims where claim_number='{victim}'")
after_gap = series()
check("S2 celah terbentuk (COUNT < MAX)", len(after_gap) == len(base) + 3 and seq_of(after_gap[-1]) == base_max + 4,
      f"seri={after_gap} count={len(after_gap)} max={seq_of(after_gap[-1])}")

# --- Fase 3: tiga klaim berikutnya HARUS MAX+1, MAX+2, MAX+3 (bukan COUNT+1) ---
trio = []
ok = True
for i in range(3):
    num, err, _ = create_claim("PT Uji Penomoran")
    want = f"{PREFIX}{base_max + 5 + i:04d}"
    ok = ok and (num == want) and not err
    trio.append(num)
check("S3 klaim pasca-celah = MAX+1..MAX+3 berurutan", ok, f"hasil={trio} (target {PREFIX}{base_max+5:04d}..{PREFIX}{base_max+7:04d})")

final = series()
check("S4 tidak ada nomor ganda di seri", len(final) == len(set(final)), f"seri akhir={final}")
check("S5 nomor terhapus tidak dipakai ulang", victim not in final, f"korban={victim}")

passed = sum(1 for _, okk in results if okk)
print(f"\n{passed}/{len(results)} PASS")
raise SystemExit(0 if passed == len(results) else 1)
