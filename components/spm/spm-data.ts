/**
 * Tipe data komponen SPM. Data nyata kini datang dari API (/api/spm/*) yang
 * membaca tabel spm_* di Supabase — file ini hanya menyimpan tipe & helper
 * pemetaan. Master tarif JSON lama tidak lagi dipakai sebagai sumber data;
 * sumber tarif adalah tabel spm_violation_rates (seed awal dari CSV yang sama).
 */
import type { SpmRate } from "@/lib/spm";

export type ViolationRate = {
  jenis_data: string;
  nomor_pelanggaran: string;
  kode_pelanggaran: string;
  deskripsi_pelanggaran: string;
  besar_denda_rp: string | number;
  basis_pengenaan: string;
  sanksi_tindakan: string;
  keterangan: string;
  halaman_pdf: string;
  status_data: string;
};

export function rateToViolationRate(r: SpmRate): ViolationRate {
  return {
    jenis_data: r.jenis_data,
    nomor_pelanggaran: r.nomor_pelanggaran ?? "",
    kode_pelanggaran: r.kode_pelanggaran,
    deskripsi_pelanggaran: r.deskripsi_pelanggaran,
    besar_denda_rp: r.amount ?? "",
    basis_pengenaan: r.basis_pengenaan ?? "",
    sanksi_tindakan: r.sanksi_tindakan ?? "",
    keterangan: r.keterangan ?? "",
    halaman_pdf: r.halaman_pdf ?? "",
    status_data: r.is_verified ? "TERVERIFIKASI" : "SUMBER_DOKUMEN",
  };
}

export const OPERATORS = ["Operator A", "Operator B", "OUTSOURCING"] as const;
