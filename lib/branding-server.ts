import { createClient } from "@/lib/supabase/server";
import { computeSnapshot, durationMonths, PLACEMENTS, type PriceEntry, type SnapshotResult } from "@/lib/branding";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ActivePricing {
  version: number;
  entries: PriceEntry[];
  ppnEnabled: boolean;
  ppnPercent: number;
}

export async function getActivePricing(supabase: Supabase): Promise<ActivePricing | null> {
  const { data } = await supabase
    .from("branding_pricing_config")
    .select("version, price_matrix, ppn_enabled, ppn_percent")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const matrix = (data.price_matrix ?? {}) as { entries?: PriceEntry[] };
  return {
    version: data.version,
    entries: Array.isArray(matrix.entries) ? matrix.entries : [],
    ppnEnabled: data.ppn_enabled,
    ppnPercent: Number(data.ppn_percent),
  };
}

/**
 * Nomor Referensi untuk grup transaksi baru:
 * format REF-<YYYYMM>-<8 heksadesimal>. Semua bus dalam satu grup berbagi
 * nomor; pemanggil lebih dulu mencari grup existing dengan atribut yang sama.
 * Tabrakan nomor diperiksa ke database dan dicoba ulang.
 */
export async function newBookingReference(supabase: Supabase): Promise<string> {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const ym = (parts.find((part) => part.type === "year")?.value ?? "0000") +
    (parts.find((part) => part.type === "month")?.value ?? "00");
  for (let i = 0; i < 5; i++) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
    const ref = `REF-${ym}-${suffix}`;
    const { data } = await supabase
      .from("branding_bookings")
      .select("id")
      .eq("reference_no", ref)
      .limit(1);
    if (!data || data.length === 0) return ref;
  }
  return `REF-${ym}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export async function snapshotForBooking(
  supabase: Supabase,
  busType: string | null,
  placement: string,
  startDate: string,
  endDate: string,
): Promise<SnapshotResult & { priced: boolean }> {
  const pricing = await getActivePricing(supabase);
  if (!pricing) return { error: "Pricelist belum dikonfigurasi.", priced: false };
  const space = PLACEMENTS[placement as keyof typeof PLACEMENTS] ?? placement;
  const duration = durationMonths(startDate, endDate);
  const result = computeSnapshot(
    pricing.entries,
    { enabled: pricing.ppnEnabled, percent: pricing.ppnPercent },
    pricing.version,
    (busType ?? "").trim(),
    space,
    duration,
  );
  return { ...result, priced: Boolean(result.snapshot) };
}
