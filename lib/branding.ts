// Logika bisnis Branding — port setia dari legacy (data-features.js + index.html inline).
export const PLACEMENTS = {
  FULL_BODY: "Full Body",
  SIDE_BODY: "Side Body",
  BACK_BODY: "Back Body",
} as const;
export type Placement = keyof typeof PLACEMENTS;

export const BOOKING_STATUSES = ["BOOKING", "PROSES", "BERJALAN", "SELESAI"] as const;

export function effectiveStatus(status: string, endDate: string): string {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => dateParts.find((value) => value.type === type)?.value ?? "";
  const today = part("year") + "-" + part("month") + "-" + part("day");
  if (status === "SELESAI" || endDate < today) return "SELESAI";
  return status;
}

/** Durasi kontrak (bulan) — aturan legacy: hari tercakup inklusif;
 *  <26 hari tidak valid; 26–34 hari = 1 bulan; selain itu bulan kalender inklusif. */
export function durationMonths(start: string, end: string): number | null {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return null;
  const days = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  if (days < 26) return null;
  if (days <= 34) return 1;
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
}

export interface PriceEntry {
  mediaBus: string;
  spaceIklan: string;
  durations: Record<string, number>;
}

const norm = (v: string) => v.trim().toLowerCase();

export interface SnapshotResult {
  snapshot?: {
    pricingVersion: number;
    mediaBus: string;
    space: string;
    duration: number;
    basePrice: number;
    ppn: number;
    totalWithPpn: number;
    monthlyRevenue: number;
    pricingNote: string;
  };
  error?: string;
}

/** Snapshot harga — port getBasePriceForBooking + createPricingSnapshot legacy. */
export function computeSnapshot(
  entries: PriceEntry[],
  ppn: { enabled: boolean; percent: number },
  pricingVersion: number,
  mediaBus: string,
  space: string,
  duration: number | null,
): SnapshotResult {
  if (!mediaBus) return { error: "Media bus tidak dapat ditentukan dari tipe bus." };
  if (!space) return { error: "Jenis branding/space iklan kosong." };
  if (!duration || !Number.isInteger(duration) || duration <= 0)
    return { error: "Tanggal mulai/akhir tidak menghasilkan durasi kontrak yang valid (min. 26 hari)." };
  const mediaRows = entries.filter((e) => norm(e.mediaBus) === norm(mediaBus));
  if (!mediaRows.length)
    return { error: `Media bus "${mediaBus}" tidak memiliki tier harga di konfigurasi.` };
  const ns = norm(space);
  let matching = mediaRows.filter((e) => norm(e.spaceIklan) === ns);
  if (!matching.length && ns === "back body")
    matching = mediaRows.filter((e) => norm(e.spaceIklan) === "full back body");
  if (!matching.length && ns === "side body") {
    const left = mediaRows.filter((e) => norm(e.spaceIklan) === "left body");
    const right = mediaRows.filter((e) => norm(e.spaceIklan) === "right body");
    if (left.length && right.length) matching = [...left, ...right];
    else
      return {
        error: `"Side Body" membutuhkan tier "Left Body" dan "Right Body". Kurang: ${[
          left.length ? "" : "Left Body",
          right.length ? "" : "Right Body",
        ]
          .filter(Boolean)
          .join(", ")}.`,
      };
  }
  if (!matching.length) {
    const avail = [...new Set(mediaRows.map((e) => e.spaceIklan.trim()).filter(Boolean))];
    return { error: `Tier "${space}" tidak ditemukan untuk "${mediaBus}". Tier tersedia: ${avail.join(", ") || "tidak ada"}.` };
  }
  let basePrice = 0;
  let fallback = false;
  for (const entry of matching) {
    const rawTier = entry.durations[duration] ?? entry.durations[String(duration)];
    if (rawTier !== undefined && rawTier !== null && Number.isFinite(Number(rawTier)) && Number(rawTier) >= 0) {
      basePrice += Number(rawTier);
      continue;
    }
    const rawMonthly = entry.durations[1] ?? entry.durations["1"];
    if (rawMonthly === undefined || rawMonthly === null || !Number.isFinite(Number(rawMonthly)) || Number(rawMonthly) < 0)
      return {
        error: `Harga durasi ${duration} bulan tidak dikonfigurasi pada tier "${entry.spaceIklan}", dan harga 1 bulan tidak tersedia sebagai fallback.`,
      };
    basePrice += Number(rawMonthly) * duration;
    fallback = true;
  }
  const ppnAmount = ppn.enabled ? Math.round((basePrice * ppn.percent) / 100) : 0;
  return {
    snapshot: {
      pricingVersion,
      mediaBus,
      space,
      duration,
      basePrice,
      ppn: ppnAmount,
      totalWithPpn: basePrice + ppnAmount,
      monthlyRevenue: Math.round(basePrice / duration),
      pricingNote: fallback ? `Dihitung ${duration} × harga 1 bulan.` : "",
    },
  };
}

/** Alokasi revenue bulanan: monthlyRevenue disebar ke tiap bulan kalender kontrak. */
export function monthKeysBetween(start: string, end: string): string[] {
  const keys: string[] = [];
  const d = new Date(start.slice(0, 7) + "-01T00:00:00Z");
  const last = end.slice(0, 7);
  while (d.toISOString().slice(0, 7) <= last) {
    keys.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return keys;
}

export function formatRupiah(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return "Rp " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export const DOC_TYPES = ["PKS", "INVOICE", "BUKTI_TRANSFER", "KWITANSI", "FAKTUR_PAJAK"] as const;
export const DOC_LABELS: Record<string, string> = {
  PKS: "PKS",
  INVOICE: "Invoice",
  BUKTI_TRANSFER: "Bukti Transfer",
  KWITANSI: "Kwitansi",
  FAKTUR_PAJAK: "Faktur Pajak",
};
export const DOC_MAX_BYTES: Record<string, number> = {
  PKS: 5 * 1024 * 1024,
  INVOICE: 2 * 1024 * 1024,
  BUKTI_TRANSFER: 2 * 1024 * 1024,
  KWITANSI: 2 * 1024 * 1024,
  FAKTUR_PAJAK: 2 * 1024 * 1024,
};
