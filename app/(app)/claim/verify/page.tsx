import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth";
import { formatRupiah } from "@/lib/branding";
import { CLAIM_STATUS_LABELS, MONTH_NAMES } from "@/lib/claim";

export default async function ClaimVerifyPage() {
  await requireContext("claim.claim.verify");
  const supabase = await createClient();
  const { data: claims } = await supabase
    .from("claims")
    .select("id, claim_number, status, period_month, period_year, operator_name, calculated_subsidy, current_version, calculated_verified_subsidy")
    .in("status", ["IN_REVIEW", "APPROVED"])
    .order("created_at", { ascending: true })
    .limit(100);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Antrean Verifikasi & Persetujuan</h3>
      <table>
        <thead><tr><th>Nomor</th><th>Operator</th><th>Periode</th><th>Status</th><th>Versi</th><th>Subsidi Diajukan</th><th>Subsidi Terverifikasi</th><th>Tidak Cair</th><th></th></tr></thead>
        <tbody>
          {(claims ?? []).map((c) => (
            <tr key={c.id}>
              <td>{c.claim_number}</td>
              <td>{c.operator_name}</td>
              <td>{MONTH_NAMES[c.period_month - 1]} {c.period_year}</td>
              <td><span className="tag">{CLAIM_STATUS_LABELS[c.status]}</span></td>
              <td>v{c.current_version}</td>
              <td>{formatRupiah(Number(c.calculated_subsidy))}</td>
              <td>{c.calculated_verified_subsidy === null || c.calculated_verified_subsidy === undefined ? "—" : formatRupiah(Number(c.calculated_verified_subsidy))}</td>
              <td>{c.calculated_verified_subsidy === null || c.calculated_verified_subsidy === undefined ? "—" : formatRupiah(Number(c.calculated_subsidy) - Number(c.calculated_verified_subsidy))}</td>
              <td><Link href={`/claim/${c.id}`}>Periksa →</Link></td>
            </tr>
          ))}
          {(claims ?? []).length === 0 && <tr><td colSpan={9} className="kpi-note">Antrean kosong — tidak ada klaim menunggu verifikasi/persetujuan.</td></tr>}
        </tbody>
      </table>
      <p className="kpi-note">Aksi Setujui memakai izin claim.claim.approve; Minta Revisi / Tolak memakai claim.claim.verify — dikerjakan di halaman detail klaim, transisi status dijaga database.</p>
    </div>
  );
}
