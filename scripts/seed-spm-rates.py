#!/usr/bin/env python3
"""Seed master tarif SPM dari components/spm/violation-master.json (sumber CSV demo).

Semua baris ditandai is_verified=false — tarif resmi menggantikannya setelah
verifikasi ke dokumen sumber. Idempoten: ON CONFLICT (kode_pelanggaran) DO NOTHING.

Pakai: python3 scripts/seed-spm-rates.py <supabase_ref> [--print-only]
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SB = "/home/hatch/workspace/custom-connectors/custom.supabase/bin/sb.py"


def q(v):
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def amount(v):
    try:
        return str(float(str(v).replace(".", "").replace(",", "."))) if v not in (None, "") else "NULL"
    except ValueError:
        return "NULL"


def main():
    ref = sys.argv[1]
    rows = json.loads((ROOT / "components/spm/violation-master.json").read_text())
    values = []
    for r in rows:
        amt = r.get("besar_denda_rp")
        try:
            amt_sql = str(int(float(str(amt)))) if amt not in (None, "") else "NULL"
        except ValueError:
            amt_sql = "NULL"
        values.append(
            "(" + ", ".join([
                q(r.get("jenis_data")), q(r.get("nomor_pelanggaran")),
                q(r.get("kode_pelanggaran")), q(r.get("deskripsi_pelanggaran")),
                amt_sql, q(r.get("basis_pengenaan")), q(r.get("sanksi_tindakan")),
                q(r.get("keterangan")), q(r.get("halaman_pdf")), "false",
            ]) + ")"
        )
    sql = (
        "insert into public.spm_violation_rates "
        "(jenis_data, nomor_pelanggaran, kode_pelanggaran, deskripsi_pelanggaran, "
        "amount, basis_pengenaan, sanksi_tindakan, keterangan, halaman_pdf, is_verified) "
        f"values {', '.join(values)} "
        "on conflict (kode_pelanggaran) do nothing; "
        "select 'rates_total=' || count(*) from public.spm_violation_rates;"
    )
    if "--print-only" in sys.argv:
        print(sql)
        return
    out = subprocess.run(
        ["python3", SB, "POST", f"/v1/projects/{ref}/database/query",
         "--json", json.dumps({"query": sql})],
        capture_output=True, text=True)
    print("RC:", out.returncode)
    print(out.stdout[:1000])
    if out.returncode != 0:
        print("ERR:", out.stderr[:500])
        sys.exit(out.returncode)


if __name__ == "__main__":
    main()
