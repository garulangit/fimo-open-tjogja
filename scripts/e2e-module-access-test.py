#!/usr/bin/env python3
"""Smoke E2E matriks akses modul (Fase 1, migration 0008) di staging.

Fixture: satu superadmin uji + satu user uji TANPA role. Alur membuktikan:
akses default tertolak -> superadmin mencentang lewat UI/API -> akses terbuka
-> centang dicabut -> tertolak lagi + audit tercatat.
"""
import json
import subprocess

BASE = "https://oms-staging.your-staging.workers.dev"
SB = "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py"
REF = "YOUR_PROJECT_REF"

env = {}
for line in open("/home/hatch/workspace/fimo-oms-v2/.env.local"):
    if "=" in line:
        k, v = line.strip().split("=", 1)
        env[k] = v
SR = env["SUPABASE_SERVICE_ROLE_KEY"]
SBASE = env["NEXT_PUBLIC_SUPABASE_URL"]

results = []


def check(name, cond, note=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL "), name, ("- " + note) if note else "")


def sql(query):
    out = subprocess.run(
        ["python3", SB, "POST", f"/v1/projects/{REF}/database/query", "--json", json.dumps({"query": query})],
        capture_output=True, text=True,
    )
    return json.loads(out.stdout) if out.stdout.strip().startswith("[") else out.stdout


def admin_api(method, path, body=None):
    # curl, bukan urllib: urllib lewat proxy sandbox tidak andal ke
    # supabase.co (RemoteDisconnected/IncompleteRead di tengah respons).
    import tempfile, os
    fd, tmp = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    cmd = ["curl", "-s", "--max-time", "90", "-X", method,
           "-H", f"apikey: {SR}", "-H", f"Authorization: Bearer {SR}",
           "-H", "Content-Type: application/json",
           "-o", tmp, "-w", "%{http_code}", SBASE + path]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    raw = open(tmp, encoding="utf-8", errors="ignore").read()
    os.unlink(tmp)
    try:
        parsed = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        parsed = {}
    return int(out or 0), parsed


def curl(jar, *args):
    cmd = ["curl", "-s", "--max-time", "90", "-c", jar, "-b", jar, "-o", "/tmp/e2e-mx-body.html", "-w", "%{http_code} %{redirect_url}"]
    cmd += list(args)
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout.strip()
    body = open("/tmp/e2e-mx-body.html", encoding="utf-8", errors="ignore").read()
    parts = out.split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else ""), body


def login(jar, username, password):
    return curl(jar, "-X", "POST", "-d", f"username={username}&password={password}", BASE + "/api/auth/login")


# ---------- Fixture ----------
ids = {}
for uname, role in (("mx_sa", "superadmin"), ("mx_user", None)):
    st, res = admin_api("POST", "/auth/v1/admin/users", {
        "email": f"{uname}@oms.internal", "password": "Uji12345", "email_confirm": True,
        "user_metadata": {"username": uname, "display_name": uname.upper()},
    })
    if st not in (200, 201):
        st2, lst = admin_api("GET", "/auth/v1/admin/users?per_page=100")
        found = [u for u in lst.get("users", []) if u["email"] == f"{uname}@oms.internal"]
        assert found, (uname, st, res)
        res = {"id": found[0]["id"]}
    ids[uname] = res["id"]
    if role:
        sql(f"insert into public.user_roles (user_id, role_id) select '{res['id']}', id from public.roles where code='{role}'")
sql("update public.profiles set must_change_password=false where username in ('mx_sa','mx_user')")
uid = ids["mx_user"]
check("Fixture mx_sa (superadmin) + mx_user (tanpa role) dibuat", len(ids) == 2)

J = "/tmp/jar-mx-"
try:
    # ---------- S1: tanpa centang, semua tertutup ----------
    code, loc, _ = login(J + "u1", "mx_user", "Uji12345")
    check("S1a login mx_user berhasil", code == "303", loc)
    _, _, body = curl(J + "u1", BASE + "/spm")
    check("S1b /spm tertolak sebelum dicentang", "Dashboard pengelolaan dan monitoring pelanggaran" not in body)
    _, _, body = curl(J + "u1", BASE + "/workspace/applications")
    check("S1c Workspace tertolak sebelum dicentang", "belum memiliki akses Workspace" in body)
    _, _, body = curl(J + "u1", BASE + "/home")
    check("S1d tile SPM tidak tampil di Home", 'href="/spm"' not in body)

    # ---------- S2: superadmin membuka halaman matriks ----------
    code, loc, _ = login(J + "sa", "mx_sa", "Uji12345")
    check("S2a login mx_sa berhasil", code == "303", loc)
    code, _, body = curl(J + "sa", f"{BASE}/admin/users/{uid}")
    check("S2b halaman Akses Modul terbuka", code == "200" and "Akses Modul" in body and "Denda SPM" in body)

    # ---------- S3: centang SPM + Workspace ----------
    # Form mengikuti UI admin saat ini (sejak migration 0012 fitur adalah
    # snapshot penuh: feat_* yang tidak terkirim berarti submenu ditolak).
    # UI mengirim centang fitur untuk modul yang diberi akses.
    code, loc, _ = curl(J + "sa", "-X", "POST", "-d", "read_spm=on&read_workspace=on&feat_spm.overview=on&feat_workspace.applications=on",
                        f"{BASE}/api/admin/users/{uid}/module-access")
    check("S3a simpan matriks diterima", "ok=akses" in loc, loc)
    rows = sql(f"select module_code, can_read, can_write from public.user_module_access where user_id='{uid}' and module_code in ('spm','workspace') order by module_code")
    got = {(r["module_code"], r["can_read"], r["can_write"]) for r in rows}
    check("S3b baris matriks tersimpan di DB", got == {("spm", True, False), ("workspace", True, False)}, str(got))

    # ---------- S4: akses terbuka ----------
    code, loc, _ = login(J + "u2", "mx_user", "Uji12345")
    _, _, body = curl(J + "u2", BASE + "/spm")
    check("S4a /spm terbuka setelah dicentang", "Dashboard pengelolaan dan monitoring pelanggaran" in body)
    _, _, body = curl(J + "u2", BASE + "/workspace/applications")
    check("S4b Workspace terbuka setelah dicentang", "belum memiliki akses Workspace" not in body)
    _, _, body = curl(J + "u2", BASE + "/home")
    check("S4c tile SPM tampil di Home", 'href="/spm"' in body)

    # ---------- S5: cabut semua centang ----------
    code, loc, _ = curl(J + "sa", "-X", "POST", "-d", "", f"{BASE}/api/admin/users/{uid}/module-access")
    check("S5a cabut centang diterima", "ok=akses" in loc, loc)
    code, loc, _ = login(J + "u3", "mx_user", "Uji12345")
    _, _, body = curl(J + "u3", BASE + "/spm")
    check("S5b /spm tertolak lagi setelah dicabut", "Dashboard pengelolaan dan monitoring pelanggaran" not in body)

    # ---------- S6: audit ----------
    rows = sql(f"select count(*)::int as n from public.audit_events where action='user.module_access.update' and entity_id='{uid}'")
    check("S6 perubahan matriks tercatat di audit", rows[0]["n"] >= 2, str(rows))
finally:
    for uname, fid in ids.items():
        admin_api("DELETE", f"/auth/v1/admin/users/{fid}")
    rows = sql("select count(*)::int as n from public.profiles where username in ('mx_sa','mx_user')")
    print("RESIDU fixture:", rows)

print(f"TOTAL: {sum(1 for _, ok in results if ok)}/{len(results)} lulus")
