#!/usr/bin/env python3
"""E2E Modul Branding melawan staging LIVE. Fixture dibersihkan di akhir.
Butuh env: OMS_BASE, SERVICE_KEY (staging), SUPA_URL."""
import json, os, subprocess, sys, urllib.request, urllib.parse

BASE = os.environ["OMS_BASE"].rstrip("/")
SVC = os.environ["SERVICE_KEY"]
SUPA = os.environ["SUPA_URL"].rstrip("/")
RESULTS = []

def check(name, cond, note=""):
    RESULTS.append((name, bool(cond), note))
    print(("PASS " if cond else "FAIL ") + " " + name + (f" - {note}" if note else ""))

def curl(args, jar=None, data=None, headers=None, method=None):
    bodyfile = "/tmp/e2e-body.bin"
    cmd = ["curl", "-s", "--max-time", "60", "-o", bodyfile, "-w", "%{http_code}\n%{redirect_url}"]
    if jar: cmd += ["-c", jar, "-b", jar]
    if method: cmd += ["-X", method]
    for h in (headers or []): cmd += ["-H", h]
    if data is not None: cmd += ["--data", data]
    cmd += args
    out = subprocess.run(cmd, capture_output=True, text=True, errors="replace").stdout
    lines = out.splitlines()
    status = int(lines[0]) if lines and lines[0].isdigit() else 0
    loc = lines[1] if len(lines) > 1 else ""
    with open(bodyfile, "rb") as f:
        body = f.read().decode("latin-1")
    return status, loc, body

def api(method, path, payload=None, auth=True):
    req = urllib.request.Request(SUPA + path, method=method)
    req.add_header("apikey", SVC)
    if auth: req.add_header("Authorization", "Bearer " + SVC)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=data, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else None

def login(jar, username, password):
    st, loc, _ = curl([BASE + "/api/auth/login"], jar=jar,
                      data=urllib.parse.urlencode({"username": username, "password": password}))
    return loc

def main():
    jar = "/tmp/e2e-branding-jar.txt"
    if os.path.exists(jar): os.remove(jar)
    # Fixture superadmin mandiri (screenshot_uji dihapus 8 Nov — jangan dipakai lagi)
    try:
        fu = api("POST", "/auth/v1/admin/users", {"email": "e2e_super@oms.internal", "password": "Uji12345",
                 "email_confirm": True, "user_metadata": {"username": "e2e_super", "display_name": "E2E Super"}})
    except Exception:
        fu = None  # sudah terdaftar dari run sebelumnya -> ambil via daftar user
    if not fu or "id" not in fu:
        lst = api("GET", "/auth/v1/admin/users?per_page=100")
        fu = {"id": [x for x in lst.get("users", []) if x["email"] == "e2e_super@oms.internal"][0]["id"]}
    fixture_id = fu["id"]
    role_id = api("GET", "/rest/v1/roles?code=eq.superadmin&select=id")[0]["id"]
    if not api("GET", f"/rest/v1/user_roles?user_id=eq.{fixture_id}&role_id=eq.{role_id}&select=user_id"):
        api("POST", "/rest/v1/user_roles", {"user_id": fixture_id, "role_id": role_id})
    api("PATCH", f"/rest/v1/profiles?id=eq.{fixture_id}", {"must_change_password": False})
    loc = login(jar, "e2e_super", "Uji12345")
    check("login superadmin uji", "error=" not in loc, loc)
    st, _, body = curl([BASE + "/"], jar=jar)
    check("dashboard termuat setelah login", "Halo" in body)

    # 0. Bersihkan sisa uji sebelumnya
    api("DELETE", "/rest/v1/branding_bookings?brand_name=like.Brand*")
    api("DELETE", "/rest/v1/branding_nota_dinas?number=like.*")
    api("DELETE", "/rest/v1/branding_admin_records?brand_name=eq.Brand%20Uji")
    api("DELETE", "/rest/v1/branding_buses?no_polisi=eq.AB%207001%20AA")
    api("DELETE", "/rest/v1/branding_buses?no_polisi=eq.AB%207002%20BB")
    # Simpan pricelist aktif SEBELUM dihapus: langkah 1 menerbitkan pricelist
    # uji di atas tabel kosong, jadi config asli wajib dipulihkan saat cleanup
    # (perbaikan 2026-11-09 — sebelumnya config asli hilang setiap suite jalan).
    saved_pricing = api("GET", "/rest/v1/branding_pricing_config?select=version,price_matrix,ppn_enabled,ppn_percent&order=version.asc") or []
    api("DELETE", "/rest/v1/branding_pricing_config?version=gte.0")

    # 1. Terbitkan pricelist v1 (uji)
    entries = [
        {"mediaBus": "Bus Besar", "spaceIklan": "Full Body", "durations": {"1": 10000000, "3": 27000000, "6": 48000000, "12": 84000000}},
        {"mediaBus": "Bus Besar", "spaceIklan": "Left Body", "durations": {"1": 4000000}},
        {"mediaBus": "Bus Besar", "spaceIklan": "Right Body", "durations": {"1": 4000000}},
        {"mediaBus": "Bus Besar", "spaceIklan": "Back Body", "durations": {"1": 5000000}},
    ]
    st, loc, _ = curl([BASE + "/api/branding/pricing"], jar=jar, data=urllib.parse.urlencode(
        {"entries": json.dumps(entries), "ppn_enabled": "on", "ppn_percent": "11"}))
    check("pricing diterbitkan", "ok=pricing" in loc, loc)

    # 2. Buat bus
    st, loc, _ = curl([BASE + "/api/branding/buses"], jar=jar, data=urllib.parse.urlencode(
        {"no_polisi": "AB 7001 AA", "fleet_no": "01", "hull_no": "L01", "bus_type": "Bus Besar", "route": "Koridor 1"}))
    check("bus dibuat", "ok=bus-dibuat" in loc, loc)
    buses = api("GET", "/rest/v1/branding_buses?no_polisi=eq.AB%207001%20AA&select=id")
    bus1 = buses[0]["id"]

    # 3. Booking FULL 3 bulan -> snapshot tier 3
    st, loc, _ = curl([BASE + "/api/branding/bookings"], jar=jar, data=urllib.parse.urlencode({
        "bus_id": bus1, "brand_name": "Brand Uji", "company_name": "PT Uji",
        "placement": "FULL_BODY", "booking_date": "2026-12-01",
        "start_date": "2027-01-01", "end_date": "2027-03-31", "status": "BOOKING"}))
    check("booking FULL dibuat", "ok=booking-dibuat" in loc, loc)
    bk = api("GET", f"/rest/v1/branding_bookings?bus_id=eq.{bus1}&select=id,pricing_snapshot")
    snap = bk[0]["pricing_snapshot"]
    check("snapshot tier 3 benar", snap and snap["basePrice"] == 27000000 and snap["totalWithPpn"] == 29970000 and snap["duration"] == 3, json.dumps(snap))
    booking1 = bk[0]["id"]

    # 4. Konflik SIDE vs FULL
    st, loc, _ = curl([BASE + "/api/branding/bookings"], jar=jar, data=urllib.parse.urlencode({
        "bus_id": bus1, "brand_name": "Brand Tabrak", "placement": "SIDE_BODY",
        "start_date": "2027-02-01", "end_date": "2027-02-27", "status": "BOOKING"}))
    check("konflik SIDE vs FULL ditolak", "error=konflik" in loc, loc)
    n = api("GET", "/rest/v1/branding_bookings?brand_name=eq.Brand%20Tabrak&select=id")
    check("booking konflik tidak tercipta", len(n) == 0)

    # 5. Bus kedua: SIDE (fallback Left+Right) lalu BACK berdampingan
    st, loc, _ = curl([BASE + "/api/branding/buses"], jar=jar, data=urllib.parse.urlencode(
        {"no_polisi": "AB 7002 BB", "bus_type": "Bus Besar"}))
    bus2 = api("GET", "/rest/v1/branding_buses?no_polisi=eq.AB%207002%20BB&select=id")[0]["id"]
    st, loc, _ = curl([BASE + "/api/branding/bookings"], jar=jar, data=urllib.parse.urlencode({
        "bus_id": bus2, "brand_name": "Brand Sisi", "placement": "SIDE_BODY",
        "start_date": "2027-01-01", "end_date": "2027-06-30", "status": "BERJALAN"}))
    check("booking SIDE dibuat", "ok=booking-dibuat" in loc, loc)
    bk2 = api("GET", f"/rest/v1/branding_bookings?bus_id=eq.{bus2}&placement=eq.SIDE_BODY&select=pricing_snapshot")
    snap2 = bk2[0]["pricing_snapshot"]
    check("snapshot SIDE = Left+Right fallback x6", snap2 and snap2["basePrice"] == 48000000, json.dumps(snap2))
    st, loc, _ = curl([BASE + "/api/branding/bookings"], jar=jar, data=urllib.parse.urlencode({
        "bus_id": bus2, "brand_name": "Brand Belakang", "placement": "BACK_BODY",
        "start_date": "2027-02-01", "end_date": "2027-04-30", "status": "BOOKING"}))
    # Aturan 0004 (keputusan user): satu booking aktif per bus per periode —
    # BACK yang tumpang tindih dengan SIDE aktif kini DITOLAK (dulu berdampingan).
    check("BACK tumpang tindih ditolak (eksklusivitas 0004)", "error=konflik" in loc, loc)

    # 5b. Nomor Referensi (0005) + booking multi-bus satu pengajuan (revisi 1.0.1 C.2)
    bkref = api("GET", f"/rest/v1/branding_bookings?id=eq.{booking1}&select=reference_no")
    ref1 = (bkref[0]["reference_no"] if bkref else "") or ""
    check("booking memiliki Nomor Referensi format REF-YYYYMM-XXXXXXXX",
          ref1.startswith("REF-") and len(ref1) == 19, ref1)
    st, loc, _ = curl([BASE + "/api/branding/bookings"], jar=jar, data=urllib.parse.urlencode([
        ("bus_ids", bus1), ("bus_ids", bus2), ("brand_name", "Brand Grup"),
        ("company_name", "PT Grup"), ("placement", "FULL_BODY"),
        ("start_date", "2027-08-01"), ("end_date", "2027-08-31"), ("status", "BOOKING")]))
    check("booking multi-bus dibuat", "ok=booking-dibuat" in loc, loc)
    grup = api("GET", "/rest/v1/branding_bookings?brand_name=eq.Brand%20Grup&select=id,bus_id,reference_no")
    check("multi-bus: 2 booking berbagi 1 Nomor Referensi",
          len(grup) == 2 and grup[0]["reference_no"] and grup[0]["reference_no"] == grup[1]["reference_no"],
          json.dumps(grup))

    # 6. Surat PDF
    st, _, body = curl([BASE + f"/api/branding/bookings/{booking1}/surat?jenis=penawaran"], jar=jar)
    check("surat penawaran PDF", st == 200 and body.startswith("%PDF"), f"status {st}")
    st, _, body = curl([BASE + f"/api/branding/bookings/{booking1}/surat?jenis=konfirmasi"], jar=jar)
    check("surat konfirmasi PDF", st == 200 and body.startswith("%PDF"), f"status {st}")

    # 7. Nota Dinas: buat -> PDF -> final -> terkunci
    st, loc, _ = curl([BASE + "/api/branding/nota"], jar=jar, data=urllib.parse.urlencode(
        {"booking_id": booking1, "skema": "TIGA_TAHAP", "perihal": "Uji E2E", "catatan": "fixture"}))
    check("nota dibuat", "ok=nota-dibuat" in loc, loc)
    nota = api("GET", "/rest/v1/branding_nota_dinas?select=id,number&order=created_at.desc&limit=1")[0]
    check("format nomor nota", "/OPR/U.1/NDN/" in nota["number"], nota["number"])
    st, _, body = curl([BASE + f"/api/branding/nota/{nota['id']}/pdf"], jar=jar)
    check("nota PDF", st == 200 and body.startswith("%PDF"), f"status {st}")
    st, loc, _ = curl([BASE + f"/api/branding/nota/{nota['id']}"], jar=jar,
                      data=urllib.parse.urlencode({"_action": "final"}))
    check("nota difinalkan", "ok=nota-final" in loc, loc)
    st, loc, _ = curl([BASE + f"/api/branding/nota/{nota['id']}"], jar=jar,
                      data=urllib.parse.urlencode({"_action": "update", "skema": "SEKALI", "perihal": "ubah paksa"}))
    check("nota FINAL terkunci dari update", "error=final" in loc, loc)

    # 8. Dokumen administrasi: record + unggah + unduh signed
    st, loc, _ = curl([BASE + "/api/branding/documents"], jar=jar, data=urllib.parse.urlencode(
        {"brand_name": "Brand Uji", "company_name": "PT Uji"}))
    check("record admin dibuat", "ok=record-dibuat" in loc, loc)
    rec = api("GET", "/rest/v1/branding_admin_records?brand_name=eq.Brand%20Uji&select=id")[0]
    pdf_min = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
    open("/tmp/uji-pks.pdf", "wb").write(pdf_min)
    out = subprocess.run(["curl", "-s", "--max-time", "60", "-c", jar, "-b", jar, "-o", "/dev/null", "-w", "%{redirect_url}",
                          "-F", "_action=upload", "-F", f"record_id={rec['id']}", "-F", "doc_type=PKS",
                          "-F", "file=@/tmp/uji-pks.pdf;type=application/pdf",
                          BASE + "/api/branding/documents"], capture_output=True, text=True, errors="replace").stdout
    check("dokumen PKS terunggah", "ok=dokumen-diunggah" in out)
    doc = api("GET", f"/rest/v1/branding_admin_documents?record_id=eq.{rec['id']}&select=storage_path")[0]
    st, loc, _ = curl([BASE + "/api/branding/files?path=" + urllib.parse.quote(doc["storage_path"])], jar=jar)
    check("unduh via signed URL", st in (301, 302, 307) and ("supabase" in loc or "files.example.com" in loc), f"{st} {loc[:60]}")

    # 9. Negatif: user tanpa role
    u = api("POST", "/auth/v1/admin/users", {"email": "e2e_norole@oms.internal", "password": "Norole123",
            "email_confirm": True, "user_metadata": {"username": "e2e_norole", "display_name": "No Role"}})
    api("PATCH", f"/rest/v1/profiles?id=eq.{u['id']}", {"must_change_password": False})
    jar2 = "/tmp/e2e-branding-jar2.txt"
    if os.path.exists(jar2): os.remove(jar2)
    login(jar2, "e2e_norole", "Norole123")
    st, _, body = curl([BASE + "/branding/bookings"], jar=jar2)
    check("user tanpa role tidak melihat form booking", "Booking baru" not in body)
    st, loc, _ = curl([BASE + "/api/branding/buses"], jar=jar2, data=urllib.parse.urlencode({"no_polisi": "AB 9999 ZZ"}))
    check("user tanpa role ditolak buat bus", "error=izin" in loc, loc)

    # Cleanup
    api("DELETE", f"/rest/v1/branding_admin_documents?record_id=eq.{rec['id']}")
    api("DELETE", f"/rest/v1/branding_admin_records?id=eq.{rec['id']}")
    api("DELETE", f"/rest/v1/branding_nota_dinas?id=eq.{nota['id']}")
    api("DELETE", "/rest/v1/branding_bookings?brand_name=like.Brand*")
    api("DELETE", "/rest/v1/branding_buses?no_polisi=eq.AB%207001%20AA")
    api("DELETE", "/rest/v1/branding_buses?no_polisi=eq.AB%207002%20BB")
    # Pulihkan pricelist yang disimpan di langkah 0 (hapus config uji dulu)
    api("DELETE", "/rest/v1/branding_pricing_config?version=gte.0")
    for row in saved_pricing:
        api("POST", "/rest/v1/branding_pricing_config", {
            "version": row["version"], "price_matrix": row["price_matrix"],
            "ppn_enabled": row["ppn_enabled"], "ppn_percent": row["ppn_percent"],
            "created_by": None})
    restored = api("GET", "/rest/v1/branding_pricing_config?select=version&order=version.desc&limit=1") or []
    if saved_pricing:
        check("pricelist asli dipulihkan", bool(restored) and restored[0]["version"] == saved_pricing[-1]["version"])
    else:
        check("pricelist asli dipulihkan", not restored)
    api("DELETE", f"/auth/v1/admin/users/{u['id']}")
    api("DELETE", f"/auth/v1/admin/users/{fixture_id}")
    try:
        req = urllib.request.Request(SUPA + "/storage/v1/object/branding-docs/" + doc["storage_path"], method="DELETE")
        req.add_header("apikey", SVC); req.add_header("Authorization", "Bearer " + SVC)
        urllib.request.urlopen(req, timeout=30)
    except Exception:
        pass
    left = api("GET", "/rest/v1/branding_buses?no_polisi=in.(AB%207001%20AA,AB%207002%20BB)&select=id")
    check("cleanup bersih", len(left) == 0)

    fails = [r for r in RESULTS if not r[1]]
    print(f"TOTAL: {len(RESULTS) - len(fails)}/{len(RESULTS)} lulus")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
