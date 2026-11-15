// Master trayek CONTOH untuk edisi terbuka — ganti dengan jaringan trayek
// di daerah Anda. Kode trayek = field `route` bus.
export interface Trayek {
  code: string;
  name: string;
}

export const TRAYEK_MASTER: Trayek[] = [
  { code: "1A", name: "Terminal Utara - Terminal Selatan via Pusat Kota" },
  { code: "1B", name: "Bandara - Taman Kota" },
  { code: "2A", name: "Terminal Timur - Terminal Barat via Pusat Kota" },
  { code: "2B", name: "Terminal Timur - Terminal Barat" },
  { code: "3A", name: "Bandara - Terminal Utara" },
  { code: "3B", name: "Terminal Selatan - Terminal Timur" },
  { code: "4A", name: "Terminal Selatan - Terminal Timur via Kampus" },
  { code: "4B", name: "Terminal Timur - Terminal Selatan via Kampus" },
  { code: "5A", name: "Terminal Barat - Stasiun Timur" },
  { code: "5B", name: "Terminal Barat - Bandara" },
  { code: "6", name: "Depo Barat - Pusat Kota" },
  { code: "8", name: "Terminal Barat - Terminal Utara" },
  { code: "9", name: "Terminal Barat - Terminal Selatan" },
  { code: "10", name: "Depo Barat - Terminal Timur" },
  { code: "11", name: "Terminal Selatan - Rumah Sakit" },
  { code: "12", name: "Terminal Timur - Terminal Utara" },
  { code: "13", name: "Stadion - Pusat Kota" },
  { code: "14", name: "Bandara - Terminal Utara" },
  { code: "15", name: "Terminal Selatan - Pusat Kota" },
  { code: "L-1", name: "Terminal Barat - Pusat Kota" },
  { code: "CAD A", name: "Bus Cadangan Operator A" },
  { code: "CAD B", name: "Bus Cadangan Operator B" },
];

export function findTrayek(code: string | null | undefined): Trayek | null {
  const norm = String(code ?? "").trim().toUpperCase();
  if (!norm) return null;
  return TRAYEK_MASTER.find((t) => t.code.toUpperCase() === norm) ?? null;
}

/** Nama trayek untuk kolom Trayek; strip dipercantik jadi " – ". */
export function trayekName(code: string | null | undefined): string {
  const t = findTrayek(code);
  if (!t) return code?.trim() || "—";
  return t.name.replace(/\s*-\s*/g, " – ");
}

// Detail rute jalan-per-jalan untuk Lampiran B Nota Dinas (CONTOH).
// Jalur lain belum ada data detailnya — tambahkan daftar rute resmi Anda di sini.
export const ROUTE_DETAILS: Record<string, string> = {
  "5B":
    "Terminal Barat – Jl. Merdeka – Jl. Sudirman – Jl. Ahmad Yani – Jl. Diponegoro – Bandara",
};
