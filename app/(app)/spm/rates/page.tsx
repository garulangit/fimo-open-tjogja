import { requireContext } from "@/lib/auth";
import { canRead } from "@/lib/module-access";
import { createClient } from "@/lib/supabase/server";
import { rateToViolationRate } from "@/components/spm/spm-data";
import type { SpmRate } from "@/lib/spm";
import RatesTable from "@/components/spm/RatesTable";

export default async function RatesPage() {
  const ctx = await requireContext();
  if (!ctx.featureAccess["spm.rates"]) return <p>Akses submenu Besaran Denda SPM dibatasi untuk akun Anda.</p>;
  const supabase = await createClient();
  const { data } = await supabase
    .from("spm_violation_rates")
    .select(
      "id, jenis_data, nomor_pelanggaran, kode_pelanggaran, deskripsi_pelanggaran, amount, basis_pengenaan, sanksi_tindakan, keterangan, halaman_pdf, is_verified, active",
    )
    .eq("active", true)
    .order("jenis_data")
    .order("nomor_pelanggaran");
  const rates = ((data ?? []) as SpmRate[]).map(rateToViolationRate);
  const anyUnverified = rates.some((r) => r.status_data !== "TERVERIFIKASI");
  return (
    <>
      <h1 className="section-title">Besaran Denda</h1>
      <p className="subtitle">
        Master tarif tersimpan di database; tarif resmi hasil verifikasi
        menggantikan baris yang relevan.
      </p>
      {anyUnverified && (
        <div className="spm-banner">
          <b>BELUM TERVERIFIKASI</b> — sebagian tarif berasal dari CSV sumber dan
          belum diverifikasi ke dokumen resmi. Nilai dan basis pengenaan
          dipertahankan persis dari sumber sampai tarif resmi dimasukkan.
        </div>
      )}
      <RatesTable rates={rates} />
    </>
  );
}
