/** Aturan domain Denda SPM — dipakai API (server) dan komponen SPM (client). */

export const FINDING_STATUSES = [
  "Pending Review",
  "Matched",
  "Unmatched",
  "Requires Clarification",
  "Verified",
  "Rejected",
  "Klarifikasi Diajukan",
  "Disetujui",
  "Disanggah",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/**
 * Durasi menit dari jam berhenti "HH:MM" ke jam jalan "HH:MM".
 * Resume < stop dianggap lewat tengah malam (+24 jam). Kembali null bila
 * salah satu jam kosong / bukan format HH:MM yang sah.
 */
export function durationMin(
  stop: string | null | undefined,
  resume: string | null | undefined,
): number | null {
  const parse = (v: string | null | undefined): number | null => {
    if (!v) return null;
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const s = parse(stop);
  const r = parse(resume);
  if (s === null || r === null) return null;
  return r >= s ? r - s : r + 1440 - s;
}

export function formatDurationMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${min} mnt`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} jam ${m} mnt` : `${h} jam`;
}

export const PENALTY_DOC_STATUSES = [
  "Draft",
  "Under Review",
  "Approved",
  "Finalized",
] as const;
export type PenaltyDocStatus = (typeof PENALTY_DOC_STATUSES)[number];

/**
 * Pemetaan operator dari nomor lambung — aturan yang sama dengan demo
 * (prefix A### -> Operator A, J### -> Operator B). Prefix lain belum terklasifikasi
 * dan tidak boleh masuk penetapan.
 */
export function operatorForFleet(value: string): string {
  const v = value.trim().toUpperCase();
  if (/^A\d{3}$/.test(v)) return "Operator A";
  if (/^J\d{3}$/.test(v)) return "Operator B";
  return "Belum terklasifikasi";
}

export interface SpmRate {
  id: string;
  jenis_data: string;
  nomor_pelanggaran: string | null;
  kode_pelanggaran: string;
  deskripsi_pelanggaran: string;
  amount: number | null;
  basis_pengenaan: string | null;
  sanksi_tindakan: string | null;
  keterangan: string | null;
  halaman_pdf: string | null;
  is_verified: boolean;
  active: boolean;
}

/** Bentuk temuan untuk komponen SPM (selaras bentuk demo lama). */
export interface SpmFinding {
  id: string;
  date: string;
  time: string | null;
  fleet: string;
  type: string;
  operator: string;
  mappedOperator: string;
  status: FindingStatus;
  dishub: string;
  operatorData: string;
  sourceCode: string;
  explanation: string;
  quantity: number;
  amount: number;
  /** Rekonsiliasi otomatis OP-006 (migration 0019): jam berhenti/jalan + durasi menit. */
  dishubStopAt: string | null;
  dishubResumeAt: string | null;
  operatorStopAt: string | null;
  operatorResumeAt: string | null;
  dishubDurationMin: number | null;
  operatorDurationMin: number | null;
}
