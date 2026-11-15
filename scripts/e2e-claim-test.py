#!/usr/bin/env python3
"""E2E Modul Klaim OMS staging: master -> klaim -> item -> dokumen -> submit ->
revisi -> ajukan ulang -> setujui -> selesai -> PDF -> negatif -> cleanup."""
import json, os, subprocess, sys, tempfile, urllib.request, urllib.error

BASE = os.environ.get("OMS_BASE", "https://oms-staging.your-staging.workers.dev")
SVC = os.environ["SERVICE_KEY"]
SUPA = os.environ["SUPA_URL"]
passed = failed = 0

def check(name, cond, note=""):
    global passed, failed
    if cond: passed += 1; print(f"PASS  {name}")
    else: failed += 1; print(f"FAIL  {name}  {note}")

def rest(method, path, body=None, key=None):
    req = urllib.request.Request(SUPA + path, method=method)
    req.add_header("apikey", key or SVC)
    req.add_header("Authorization", "Bearer " + (key or SVC))
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]

jar = tempfile.mktemp(suffix=".txt")

def http(method, path, data=None, files=None, jarfile=None):
    cmd = ["curl", "-s", "-o", "/tmp/e2ec-body", "-w", "%{http_code}\n%{redirect_url}"]
    if jarfile: cmd += ["-c", jarfile, "-b", jarfile]
    if files:
        # Semua field ikut multipart (-F); mencampur --data-urlencode dengan -F membuat curl gagal diam-diam.
        if data:
            for k, v in data.items(): cmd += ["-F", f"{k}={v}"]
        for k, (fn, ct) in files.items(): cmd += ["-F", f"{k}=@{fn};type={ct}"]
    elif data:
        for k, v in data.items(): cmd += ["--data-urlencode", f"{k}={v}"]
    cmd += [BASE + path]
    for attempt in range(2):
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        raw = proc.stdout.strip()
        if raw:
            out = raw.split("\n")
            body = open("/tmp/e2ec-body", "rb").read()
            return int(out[0]), (out[1] if len(out) > 1 else ""), body
        print(f"   (curl kosong, percobaan {attempt + 1}: {proc.stderr.strip()[:160]})")
    raise RuntimeError(f"curl gagal total: {path}")

# --- pra-bersih sisa run sebelumnya ---
rest("DELETE", "/rest/v1/claims?claim_number=like.CLM-E-2099%25")
rest("DELETE", "/rest/v1/claim_vehicle_types?code=eq.E2ED")
rest("DELETE", "/rest/v1/claim_regulation_versions?code=eq.E2EREG")
rest("DELETE", "/rest/v1/claim_document_types?code=eq.E2EINV")

# --- fixture superadmin mandiri (screenshot_uji dihapus 8 Nov — jangan dipakai lagi) ---
_, fu = rest("POST", "/auth/v1/admin/users", {"email": "e2e_super@oms.internal", "password": "Uji12345",
             "email_confirm": True, "user_metadata": {"username": "e2e_super", "display_name": "E2E Super"}})
if not isinstance(fu, dict) or "id" not in fu:
    _, lst = rest("GET", "/auth/v1/admin/users?per_page=100")
    fu = {"id": [x for x in lst.get("users", []) if x["email"] == "e2e_super@oms.internal"][0]["id"]}
fixture_id = fu["id"]
_, roles = rest("GET", "/rest/v1/roles?code=eq.superadmin&select=id")
_, existing = rest("GET", f"/rest/v1/user_roles?user_id=eq.{fixture_id}&role_id=eq.{roles[0]['id']}&select=user_id")
if not existing:
    rest("POST", "/rest/v1/user_roles", {"user_id": fixture_id, "role_id": roles[0]["id"]})
rest("PATCH", f"/rest/v1/profiles?id=eq.{fixture_id}", {"must_change_password": False})

# --- login admin ---
code, redir, _ = http("POST", "/api/auth/login", {"username": "e2e_super", "password": "Uji12345"}, jarfile=jar)
check("K1 login admin", code == 303, f"code={code}")

# --- master via UI ---
http("POST", "/api/claim/master", {"_entity": "vehicle", "code": "E2ED", "name": "Bus E2E Diesel"}, jarfile=jar)
http("POST", "/api/claim/master", {"_entity": "regulation", "code": "E2EREG", "title": "Regulasi E2E"}, jarfile=jar)
http("POST", "/api/claim/master", {"_entity": "doctype", "code": "E2EINV", "name": "Invoice E2E", "default_sort_order": "1"}, jarfile=jar)
_, veh = rest("GET", "/rest/v1/claim_vehicle_types?code=eq.E2ED&select=id")
_, reg = rest("GET", "/rest/v1/claim_regulation_versions?code=eq.E2EREG&select=id")
_, doc = rest("GET", "/rest/v1/claim_document_types?code=eq.E2EINV&select=id")
check("K2 master kendaraan/regulasi/dokumen dibuat", bool(veh and reg and doc), f"{veh} {reg} {doc}")
vid, rid, did = veh[0]["id"], reg[0]["id"], doc[0]["id"]
http("POST", "/api/claim/master", {"_entity": "category", "regulation_version_id": rid, "vehicle_type_id": vid,
     "code": "1.1", "name": "Biaya BBM E2E", "category_type": "DIRECT_COST", "is_input": "on", "sort_order": "1"}, jarfile=jar)
http("POST", "/api/claim/master", {"_entity": "category", "regulation_version_id": rid, "vehicle_type_id": vid,
     "code": "2.1", "name": "Biaya Admin E2E", "category_type": "INDIRECT_COST", "is_input": "on", "sort_order": "2"}, jarfile=jar)
_, cats = rest("GET", f"/rest/v1/claim_cost_categories?regulation_version_id=eq.{rid}&select=id,code&order=code")
check("K3 kategori pohon dibuat", cats and len(cats) == 2, str(cats))
cat1, cat2 = cats[0]["id"], cats[1]["id"]
http("POST", "/api/claim/master", {"_entity": "requirement", "cost_category_id": cat1, "document_type_id": did,
     "max_size_mb": "15", "is_mandatory": "on"}, jarfile=jar)
_, reqs = rest("GET", f"/rest/v1/claim_document_requirements?cost_category_id=eq.{cat1}&select=id")
check("K4 requirement dokumen terhubung", bool(reqs), str(reqs))

# --- buat klaim ---
code, redir, _ = http("POST", "/api/claim/claims", {
    "vehicle_type_id": vid, "regulation_version_id": rid, "period_month": "12", "period_year": "2099",
    "operator_name": "PT E2E Trans", "pic_name": "PIC E2E", "pic_position": "Staf",
    "profit_percentage": "7"}, jarfile=jar)
claim_id = redir.rstrip("/").split("/")[-1].split("?")[0] if redir else ""
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=claim_number,status")
check("K5 klaim dibuat CLM-E-2099-* DRAFT", bool(cl) and cl[0]["claim_number"].startswith("CLM-E-2099-") and cl[0]["status"] == "DRAFT", str(cl))
_, items = rest("GET", f"/rest/v1/claim_items?claim_id=eq.{claim_id}&select=id,cost_category_id")
check("K6 item otomatis dari kategori input (2)", items and len(items) == 2, str(items))
item1 = next(i["id"] for i in items if i["cost_category_id"] == cat1)
item2 = next(i["id"] for i in items if i["cost_category_id"] == cat2)

# --- isi item: BBM 100jt + PPN 11% ; Admin 50jt tanpa pajak ---
http("POST", f"/api/claim/claims/{claim_id}", {
    "_action": "items",
    f"nominal_{item1}": "100000000", f"taxtype_{item1}": "PPN_11", f"taxrate_{item1}": "0",
    f"nominal_{item2}": "50000000", f"taxtype_{item2}": "NONE", f"taxrate_{item2}": "0"}, jarfile=jar)
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=total_direct_cost,total_indirect_cost,total_base_cost,total_profit,total_operational_cost,calculated_subsidy")
t = cl[0] if cl else {}
check("K7 kalkulasi persis legacy (111jt/50jt/161jt/profit 11,27jt/op 172,27jt)",
      float(t.get("total_direct_cost", 0)) == 111000000 and float(t.get("total_indirect_cost", 0)) == 50000000
      and float(t.get("total_base_cost", 0)) == 161000000 and float(t.get("total_profit", 0)) == 11270000
      and float(t.get("total_operational_cost", 0)) == 172270000, str(t))

# --- D.3 (revisi 1.0.1): dokumen kurang = catatan kelengkapan, BUKAN penghalang ---
code, _, body = http("GET", f"/claim/{claim_id}", jarfile=jar)
html = body.decode("utf-8", "ignore")
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=status")
check("K8 dokumen kurang tampil sebagai catatan kelengkapan (klaim tetap DRAFT, dapat diajukan)",
      "Catatan Kelengkapan" in html and "dokumen belum diunggah" in html and cl[0]["status"] == "DRAFT",
      f"status={cl}")

# --- unggah dokumen PDF ---
pdf_path = "/tmp/e2ec-evidence.pdf"
open(pdf_path, "wb").write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF")
code, redir, _ = http("POST", f"/api/claim/claims/{claim_id}/documents",
                      {"claim_item_id": item1, "document_type_id": did},
                      files={"file": (pdf_path, "application/pdf")}, jarfile=jar)
_, docs = rest("GET", f"/rest/v1/claim_item_documents?claim_id=eq.{claim_id}&select=storage_path,page_count")
check("K9 dokumen bukti terunggah + tercatat", "ok=" in redir and bool(docs) and docs[0]["storage_path"], f"redir={redir[:70]} docs={docs}")

# --- pendapatan tiket 40jt ---
http("POST", f"/api/claim/claims/{claim_id}", {
    "_action": "revenues", "rev_code_0": "3.1", "rev_name_0": "Penerimaan Tiket",
    "rev_cat_0": "TICKET", "rev_nominal_0": "40000000"}, jarfile=jar)
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=total_revenue,calculated_subsidy")
check("K10 subsidi = operasional - pendapatan (132,27jt)",
      cl and float(cl[0]["total_revenue"]) == 40000000 and float(cl[0]["calculated_subsidy"]) == 132270000, str(cl))

# --- submit lolos -> IN_REVIEW + snapshot v1 ---
code, redir, _ = http("POST", f"/api/claim/claims/{claim_id}", {"_action": "submit"}, jarfile=jar)
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=status,current_version")
_, vers = rest("GET", f"/rest/v1/claim_versions?claim_id=eq.{claim_id}&select=version_number")
check("K11 submit lolos -> IN_REVIEW + snapshot v1",
      "ok=" in redir and cl[0]["status"] == "IN_REVIEW" and len(vers) == 1 and vers[0]["version_number"] == 1,
      f"redir={redir[:70]} cl={cl} vers={vers}")

# --- review: minta revisi ---
http("POST", f"/api/claim/claims/{claim_id}", {"_action": "review", "review_action": "REQUEST_REVISION", "review_notes": "Perbaiki bukti BBM"}, jarfile=jar)
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=status,notes")
check("K12 REQUEST_REVISION + catatan verifikator",
      cl[0]["status"] == "REVISION_REQUIRED" and "[Catatan Verifikator]: Perbaiki bukti BBM" in (cl[0]["notes"] or ""), str(cl))

# --- ajukan ulang -> versi 2 ---
http("POST", f"/api/claim/claims/{claim_id}", {"_action": "submit", "revision_reason": "Bukti diperbaiki"}, jarfile=jar)
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=status,current_version")
_, vers = rest("GET", f"/rest/v1/claim_versions?claim_id=eq.{claim_id}&select=version_number")
check("K13 pengajuan ulang -> IN_REVIEW versi 2", cl[0]["status"] == "IN_REVIEW" and cl[0]["current_version"] == 2 and len(vers) == 2, f"cl={cl} vers={vers}")

# --- setujui -> selesai ---
http("POST", f"/api/claim/claims/{claim_id}", {"_action": "review", "review_action": "APPROVE"}, jarfile=jar)
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=status")
ok_app = cl and cl[0]["status"] == "APPROVED"
http("POST", f"/api/claim/claims/{claim_id}", {"_action": "review", "review_action": "COMPLETE"}, jarfile=jar)
_, cl = rest("GET", f"/rest/v1/claims?id=eq.{claim_id}&select=status")
check("K14 APPROVE -> COMPLETED", bool(ok_app) and cl[0]["status"] == "COMPLETED", str(cl))

# --- PDF surat ---
code, _, body = http("GET", f"/api/claim/claims/{claim_id}/pdf", jarfile=jar)
check("K15 PDF surat pengajuan valid", code == 200 and body[:4] == b"%PDF", f"code={code}")

# --- klaim kedua: review ilegal dari DRAFT + hapus ---
code, redir, _ = http("POST", "/api/claim/claims", {
    "vehicle_type_id": vid, "regulation_version_id": rid, "period_month": "11", "period_year": "2099",
    "operator_name": "PT E2E Dua", "pic_name": "X", "pic_position": "Y", "profit_percentage": "7"}, jarfile=jar)
claim2 = redir.rstrip("/").split("/")[-1].split("?")[0] if redir else ""
http("POST", f"/api/claim/claims/{claim2}", {"_action": "review", "review_action": "APPROVE"}, jarfile=jar)
_, cl2 = rest("GET", f"/rest/v1/claims?id=eq.{claim2}&select=status")
check("K16 review dari DRAFT tertahan (tetap DRAFT)", cl2 and cl2[0]["status"] == "DRAFT", str(cl2))

# --- D.3 + D.4 (revisi 1.0.1): submit TANPA dokumen tetap lolos + CSV summary ---
_, items2 = rest("GET", f"/rest/v1/claim_items?claim_id=eq.{claim2}&select=id")
it2 = items2[0]["id"] if items2 else ""
http("POST", f"/api/claim/claims/{claim2}", {
    "_action": "items", f"nominal_{it2}": "1000000", f"taxtype_{it2}": "NONE", f"taxrate_{it2}": "0"}, jarfile=jar)
code, redir, _ = http("POST", f"/api/claim/claims/{claim2}", {"_action": "submit"}, jarfile=jar)
_, cl2 = rest("GET", f"/rest/v1/claims?id=eq.{claim2}&select=status")
check("K16b submit tanpa dokumen LOLOS (aturan D.3) + penanda unduhan CSV",
      "ok=" in redir and "summary=1" in redir and cl2 and cl2[0]["status"] == "IN_REVIEW",
      f"redir={redir[:90]} cl2={cl2}")
code, _, body = http("GET", f"/api/claim/claims/{claim2}/summary", jarfile=jar)
csv = body.decode("utf-8-sig", "ignore")
check("K16c CSV ringkasan pengajuan: checklist + identitas pengajuan",
      code == 200 and "CHECKLIST KELENGKAPAN DOKUMEN" in csv and "Nomor Pengajuan" in csv, f"code={code}")
# kembalikan ke status editable agar penghapusan via UI (K17) tetap berlaku
http("POST", f"/api/claim/claims/{claim2}", {"_action": "review", "review_action": "REQUEST_REVISION", "review_notes": "uji D.3"}, jarfile=jar)

http("POST", f"/api/claim/claims/{claim2}", {"_action": "delete"}, jarfile=jar)
_, cl2 = rest("GET", f"/rest/v1/claims?id=eq.{claim2}&select=id")
check("K17 klaim draft terhapus via UI", cl2 == [], str(cl2))

# --- user tanpa role ---
code, redir, _ = http("POST", "/api/auth/login", {"username": "screenshot_uji", "password": "salah"}, jarfile=tempfile.mktemp())
check("K18 login password salah tertahan", code == 303 and "err" in redir or code == 200, f"code={code}")

# --- cleanup (REST delete, service role) ---
rest("DELETE", f"/auth/v1/admin/users/{fixture_id}")
rest("DELETE", f"/rest/v1/claims?id=eq.{claim_id}")
rest("DELETE", f"/rest/v1/claim_vehicle_types?id=eq.{vid}")
rest("DELETE", f"/rest/v1/claim_regulation_versions?id=eq.{rid}")
rest("DELETE", f"/rest/v1/claim_document_types?id=eq.{did}")
_, left = rest("GET", "/rest/v1/claims?claim_number=like.CLM-E-2099%25&select=id")
_, leftv = rest("GET", "/rest/v1/claim_vehicle_types?code=eq.E2ED&select=id")
check("K19 cleanup bersih", left == [] and leftv == [], f"claims={left} veh={leftv}")
_, aud = rest("GET", "/rest/v1/audit_events?module_code=eq.claim&select=action&order=created_at.desc&limit=30")
acts = [a["action"] for a in (aud or [])]
check("K20 audit trail klaim tercatat", "claim.submit" in acts and "claim.review" in acts and "claim.create" in acts, str(acts[:8]))

print(f"\nTOTAL: {passed}/{passed + failed} lulus")
sys.exit(1 if failed else 0)
