#!/usr/bin/env python3
"""E2E storage self-hosted (Fase 3, migration 0011) di staging.

Bukti yang dicari:
- Unggah foto bus baru mendarat di MinIO (baris DB storage_backend='minio')
  dan objeknya benar-benar bisa diambil dari files.example.com.
- Unduh lewat /api/branding/files mengikuti backend baris itu (redirect ke
  URL bertanda tangan MinIO) dan isinya byte-identik.
- Berkas lama hasil migrasi (backend minio) tetap bisa diunduh.
- Berkas backend supabase (dokumen klaim) tetap bisa diunduh (campuran hidup).
"""
import hashlib
import hmac
import json
import os
import subprocess
from datetime import datetime, timezone

BASE = "https://oms-staging.your-staging.workers.dev"
SB = "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py"
REF = "YOUR_PROJECT_REF"
CREDS = json.load(open(os.path.expanduser(
    "~/workspace/goals/fimo-oms-baru-gabung-branding-klaim-subsidi/"
    "hidden_files/storage-thor/minio-credentials.json")))

env = {}
for line in open("/home/hatch/workspace/fimo-oms-v2/.env.local"):
    if "=" in line:
        k, v = line.strip().split("=", 1)
        env[k] = v
SR = env["SUPABASE_SERVICE_ROLE_KEY"]
SBASE = env["NEXT_PUBLIC_SUPABASE_URL"]
PW = "Uji12345"

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
    args = ["curl", "-s", "--max-time", "60", "-X", method,
            "-H", f"apikey: {SR}", "-H", f"Authorization: Bearer {SR}",
            "-H", "Content-Type: application/json", "-w", "\n%{http_code}", SBASE + path]
    if body is not None:
        args += ["-d", json.dumps(body)]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    raw, _, code = out.rpartition("\n")
    try:
        return int(code), json.loads(raw or "{}")
    except json.JSONDecodeError:
        return int(code or 0), {"raw": raw[:200]}


def curl(jar, *args, out="/tmp/e2e-stor-body.bin"):
    cmd = ["curl", "-s", "--max-time", "90", "-c", jar, "-b", jar, "-o", out, "-w", "%{http_code} %{redirect_url}"]
    cmd += list(args)
    raw = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    parts = raw.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), out


def s3_get(key):
    ak, sk = CREDS["app_access_key"], CREDS["app_secret_key"]
    host = "files.example.com"
    now = datetime.now(timezone.utc)
    ts = now.strftime("%Y%m%dT%H%M%SZ")
    d = now.strftime("%Y%m%d")
    ph = hashlib.sha256(b"").hexdigest()
    headers = {"host": host, "x-amz-content-sha256": ph, "x-amz-date": ts}
    sh = ";".join(sorted(headers))
    canon = "\n".join(["GET", f"/fimo-files/{key}", "",
                       "".join(f"{k}:{headers[k]}\n" for k in sorted(headers)), sh, ph])
    scope = f"{d}/us-east-1/s3/aws4_request"
    sts = "\n".join(["AWS4-HMAC-SHA256", ts, scope, hashlib.sha256(canon.encode()).hexdigest()])

    def H(k, m):
        return hmac.new(k, m.encode(), hashlib.sha256).digest()
    key_sign = H(H(H(H(("AWS4" + sk).encode(), d), "us-east-1"), "s3"), "aws4_request")
    sig = hmac.new(key_sign, sts.encode(), hashlib.sha256).hexdigest()
    auth = f"AWS4-HMAC-SHA256 Credential={ak}/{scope}, SignedHeaders={sh}, Signature={sig}"
    out = subprocess.run(["curl", "-s", "--max-time", "60", "-o", "/tmp/e2e-stor-s3.bin", "-w", "%{http_code}",
                          f"https://{host}/fimo-files/{key}",
                          "-H", f"Authorization: {auth}", "-H", f"x-amz-date: {ts}",
                          "-H", f"x-amz-content-sha256: {ph}"], capture_output=True, text=True)
    return out.stdout.strip(), open("/tmp/e2e-stor-s3.bin", "rb").read()


# 1x1 PNG valid
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082")

user_id = None
photo_id = None
photo_path = None
try:
    # ---------- Fixture ----------
    _, u = admin_api("POST", "/auth/v1/admin/users", {
        "email": "stor_sa@oms.internal", "password": PW, "email_confirm": True,
        "user_metadata": {"username": "stor_sa"}})
    user_id = u.get("id")
    sql(f"update public.profiles set must_change_password=false, active=true where id='{user_id}'")
    sql(f"insert into public.user_roles (user_id, role_id) select '{user_id}', id from public.roles where code='superadmin'")
    check("Fixture stor_sa (superadmin) dibuat", bool(user_id))

    jar = "/tmp/e2e-stor-jar.txt"
    code, redir, _ = curl(jar, "-X", "POST", "-d", f"username=stor_sa&password={PW}", BASE + "/api/auth/login")
    check("Login stor_sa", code == "303" and "error=" not in redir, redir)

    bus = sql("select id from public.branding_buses order by created_at limit 1")
    bus_id = bus[0]["id"]

    open("/tmp/e2e-photo.png", "wb").write(PNG)
    code, redir, _ = curl(jar, "-F", f"bus_id={bus_id}", "-F", "file=@/tmp/e2e-photo.png;type=image/png",
                          BASE + "/api/branding/photos")
    check("S1 unggah foto -> ok=foto-diunggah", "ok=foto-diunggah" in redir, redir)

    rows = sql(f"select id, storage_path, storage_backend from public.branding_bus_photos "
               f"where bus_id='{bus_id}' and file_name='e2e-photo.png' order by uploaded_at desc limit 1")
    photo_id = rows[0]["id"] if rows else None
    photo_path = rows[0]["storage_path"] if rows else None
    check("S2 baris foto tercatat backend minio", rows and rows[0]["storage_backend"] == "minio",
          str(rows[0]) if rows else "tidak ada baris")

    scode, sbody = s3_get(f"branding-docs/{photo_path}")
    check("S3 objek ada di MinIO & byte identik", scode == "200" and sbody == PNG,
          f"HTTP {scode}, {len(sbody)} B")

    code, redir, out = curl(jar, "-L", BASE + f"/api/branding/files?path={photo_path}")
    data = open(out, "rb").read()
    check("S4 unduh via /api/branding/files byte identik", code == "200" and data == PNG,
          f"HTTP {code}, {len(data)} B")

    mig = sql("select storage_path, file_size from public.branding_admin_documents "
              "where storage_backend='minio' and storage_path is not null limit 1")
    if mig:
        import urllib.parse
        code, redir, out = curl(jar, "-L", BASE + "/api/branding/files?path=" + urllib.parse.quote(mig[0]['storage_path'], safe=""))
        data = open(out, "rb").read()
        check("S5 berkas migrasi (minio) terunduh utuh",
              code == "200" and len(data) == mig[0]["file_size"],
              f"HTTP {code}, {len(data)} vs {mig[0]['file_size']} B")
    else:
        check("S5 berkas migrasi (minio) terunduh utuh", False, "tidak ada baris minio")

    # Staging tidak punya baris dokumen klaim sama sekali (11 objek claim-docs
    # adalah yatim sisa uji lama). Cabang supabase dibuktikan lewat objek
    # branding yatim tanpa baris DB: route kembali ke backend supabase.
    import urllib.parse
    orphan = "etl/photos/AB 7832 AK_ads3.png"
    code, redir, out = curl(jar, "-L", BASE + "/api/branding/files?path=" + urllib.parse.quote(orphan, safe=""))
    data = open(out, "rb").read()
    check("S6 objek supabase (tanpa baris) tetap terunduh", code == "200" and data[:4] == b"\x89PNG",
          f"HTTP {code}, {len(data)} B")
finally:
    if photo_id:
        sql(f"delete from public.branding_bus_photos where id='{photo_id}'")
    if photo_path:
        # hapus objek minio uji
        ak, sk = CREDS["app_access_key"], CREDS["app_secret_key"]
        globals()["s3_get"].__wrapped__ if False else None
        import urllib.parse
        # DELETE memakai pola tanda tangan yang sama; cukup pakai mc lewat API S3 GET cek residu setelah hapus via route tidak tersedia -> pakai s3 DELETE sederhana:
        now = datetime.now(timezone.utc)
        ts = now.strftime("%Y%m%dT%H%M%SZ")
        d = now.strftime("%Y%m%d")
        ph = hashlib.sha256(b"").hexdigest()
        host = "files.example.com"
        key = f"branding-docs/{photo_path}"
        headers = {"host": host, "x-amz-content-sha256": ph, "x-amz-date": ts}
        sh = ";".join(sorted(headers))
        canon = "\n".join(["DELETE", f"/fimo-files/{key}", "",
                           "".join(f"{k}:{headers[k]}\n" for k in sorted(headers)), sh, ph])
        scope = f"{d}/us-east-1/s3/aws4_request"
        sts = "\n".join(["AWS4-HMAC-SHA256", ts, scope, hashlib.sha256(canon.encode()).hexdigest()])

        def H(k, m):
            return hmac.new(k, m.encode(), hashlib.sha256).digest()
        key_sign = H(H(H(H(("AWS4" + sk).encode(), d), "us-east-1"), "s3"), "aws4_request")
        sig = hmac.new(key_sign, sts.encode(), hashlib.sha256).hexdigest()
        auth = f"AWS4-HMAC-SHA256 Credential={ak}/{scope}, SignedHeaders={sh}, Signature={sig}"
        subprocess.run(["curl", "-s", "--max-time", "60", "-X", "DELETE",
                        f"https://{host}/fimo-files/{key}",
                        "-H", f"Authorization: {auth}", "-H", f"x-amz-date: {ts}",
                        "-H", f"x-amz-content-sha256: {ph}"], capture_output=True)
    if user_id:
        sql(f"delete from public.user_roles where user_id='{user_id}'")
        admin_api("DELETE", f"/auth/v1/admin/users/{user_id}")
    residu = sql("select (select count(*) from public.branding_bus_photos where file_name='e2e-photo.png') as p")
    check("Residu fixture bersih", residu[0]["p"] == 0, str(residu))

print(f"TOTAL: {sum(1 for _, ok in results if ok)}/{len(results)} lulus")
