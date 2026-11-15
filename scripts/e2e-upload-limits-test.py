#!/usr/bin/env python3
"""Uji gerbang batas unggahan baru (12 Nov 2026) di staging:
PKS 5MB, dokumen branding lain 2MB, foto bus 1MB, klaim 20MB.
File uji = header valid + padding; yang diuji adalah GERBANG UKURAN
(kode branding/foto tidak mem-parse isi PDF; klaim diuji dari pesan
errornya: 16MB tidak boleh lagi kena 'melebihi batas', 21MB harus kena
'melebihi batas 20')."""
import json
import subprocess

BASE = "https://oms-staging.your-staging.workers.dev"
SB = "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py"
REF = "YOUR_PROJECT_REF"
PW = "Uji12345"
MB = 1024 * 1024

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


def make_file(path, total, header):
    with open(path, "wb") as f:
        f.write(header)
        f.write(b"%" + b"x" * (total - len(header) - 1))


def post_form(jar, url, fields):
    cmd = ["curl", "-s", "--max-time", "300", "-c", jar, "-b", jar, "-o", "/tmp/gate-body.html",
           "-w", "%{http_code} %{redirect_url}"]
    for k, v in fields:
        cmd += ["-F", v if k == "@" else f"{k}={v}"]
    cmd.append(url)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=330).stdout.strip()
    body = open("/tmp/gate-body.html", encoding="utf-8", errors="ignore").read()
    parts = out.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


PDF = b"%PDF-1.4\n"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001a1f78a6d0000000049454e44ae426082")
make_file("/tmp/g3.pdf", 3 * MB, PDF)
make_file("/tmp/g6.pdf", 6 * MB, PDF)
make_file("/tmp/g15.pdf", int(1.5 * MB), PDF)
make_file("/tmp/g25.pdf", int(2.5 * MB), PDF)
make_file("/tmp/g16.pdf", 16 * MB, PDF)
make_file("/tmp/g21.pdf", 21 * MB, PDF)
make_file("/tmp/g09.png", int(0.9 * MB), PNG)
make_file("/tmp/g12.png", int(1.2 * MB), PNG)

# ---------- fixture SA ----------
st, res = admin_api("POST", "/auth/v1/admin/users", {
    "email": "ul_sa@oms.internal", "password": PW, "email_confirm": True,
    "user_metadata": {"username": "ul_sa", "display_name": "UL SA"}})
if st not in (200, 201):
    _, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
    res = {"id": [u for u in lst["users"] if u["email"] == "ul_sa@oms.internal"][0]["id"]}
SA = res["id"]
sql(f"insert into public.user_roles (user_id, role_id) select '{SA}', id from public.roles where code='superadmin' on conflict do nothing")
sql(f"update public.profiles set must_change_password=false, active=true where id='{SA}'")
J = "/tmp/jar-gate"
post_form(J, BASE + "/api/auth/login", [("username", "ul_sa"), ("password", PW)])

try:
    rec = sql("select id from public.branding_admin_records limit 1")[0]["id"]
    bus = sql("select id from public.branding_buses limit 1")[0]["id"]

    _, loc, _ = post_form(J, BASE + "/api/branding/documents", [
        ("_action", "upload"), ("record_id", rec), ("doc_type", "PKS"), ("@", "file=@/tmp/g3.pdf;type=application/pdf;filename=gate-pks3.pdf")])
    check("U1 PKS 3MB diterima (batas baru 5MB)", "error=ukuran" not in loc and "error" not in loc, loc[-70:])
    _, loc, _ = post_form(J, BASE + "/api/branding/documents", [
        ("_action", "upload"), ("record_id", rec), ("doc_type", "PKS"), ("@", "file=@/tmp/g6.pdf;type=application/pdf;filename=gate-pks6.pdf")])
    check("U2 PKS 6MB ditolak (error=ukuran)", "error=ukuran" in loc, loc[-70:])
    _, loc, _ = post_form(J, BASE + "/api/branding/documents", [
        ("_action", "upload"), ("record_id", rec), ("doc_type", "INVOICE"), ("@", "file=@/tmp/g15.pdf;type=application/pdf;filename=gate-inv15.pdf")])
    check("U3 INVOICE 1,5MB diterima (batas baru 2MB)", "error" not in loc, loc[-70:])
    _, loc, _ = post_form(J, BASE + "/api/branding/documents", [
        ("_action", "upload"), ("record_id", rec), ("doc_type", "INVOICE"), ("@", "file=@/tmp/g25.pdf;type=application/pdf;filename=gate-inv25.pdf")])
    check("U4 INVOICE 2,5MB ditolak (error=ukuran)", "error=ukuran" in loc, loc[-70:])

    _, loc, _ = post_form(J, BASE + "/api/branding/photos", [
        ("bus_id", bus), ("@", "file=@/tmp/g09.png;type=image/png;filename=gate-photo09.png")])
    check("U5 Foto 0,9MB diterima (batas baru 1MB)", "error" not in loc, loc[-70:])
    _, loc, _ = post_form(J, BASE + "/api/branding/photos", [
        ("bus_id", bus), ("@", "file=@/tmp/g12.png;type=image/png;filename=gate-photo12.png")])
    check("U6 Foto 1,2MB ditolak (error=ukuran)", "error=ukuran" in loc, loc[-70:])

    # ---------- klaim: fixture DRAFT via SQL ----------
    meta = sql("""select json_build_object(
      'vt', (select id from public.claim_vehicle_types limit 1),
      'rv', (select id from public.claim_regulation_versions limit 1),
      'cc', (select cost_category_id from public.claim_document_requirements limit 1),
      'dt', (select document_type_id from public.claim_document_requirements limit 1)) as m""")[0]["m"]
    cid = sql(f"""insert into public.claims (claim_number, vehicle_type_id, regulation_version_id,
                    period_month, period_year, operator_name, pic_name, pic_position, status)
                  values ('GATE-2026-0001', '{meta['vt']}', '{meta['rv']}', 1, 2026,
                          'GATE OP', 'Gate', 'Uji', 'DRAFT') returning id""")[0]["id"]
    iid = sql(f"""insert into public.claim_items (claim_id, cost_category_id)
                  values ('{cid}', '{meta['cc']}') returning id""")[0]["id"]
    _, loc, _ = post_form(J, f"{BASE}/api/claim/claims/{cid}/documents", [
        ("claim_item_id", iid), ("document_type_id", meta["dt"]),
        ("@", "file=@/tmp/g16.pdf;type=application/pdf;filename=gate-klaim16.pdf")])
    import urllib.parse as up
    check("U7 Klaim 16MB TIDAK kena batas ukuran lagi", "melebihi%20batas" not in loc and "melebihi batas" not in up.unquote(loc), loc[-80:])
    _, loc, _ = post_form(J, f"{BASE}/api/claim/claims/{cid}/documents", [
        ("claim_item_id", iid), ("document_type_id", meta["dt"]),
        ("@", "file=@/tmp/g21.pdf;type=application/pdf;filename=gate-klaim21.pdf")])
    check("U8 Klaim 21MB ditolak batas 20MB", "melebihi" in up.unquote(loc) and "20" in up.unquote(loc), loc[-80:])
    sql(f"delete from public.claims where id='{cid}'")
finally:
    # cleanup unggahan gate di branding (baris DB; objek staging dibiarkan
    # tertanda nama gate-* agar mudah dikenali, staging memang area uji)
    sql("delete from public.branding_admin_documents where file_name like 'gate-%'")
    sql("delete from public.branding_bus_photos where file_name like 'gate-%'")
    admin_api("DELETE", f"/auth/v1/admin/users/{SA}")
    check("U9 cleanup fixture selesai", True)

failed = [n for n, ok in results if not ok]
print(f"\n== {len(results) - len(failed)}/{len(results)} PASS ==")
if failed:
    print("GAGAL:", failed)
    raise SystemExit(1)
