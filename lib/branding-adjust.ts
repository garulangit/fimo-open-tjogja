import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Override total transaksi Branding (nego) — migration 0013, KUNCI RASIO.
 * pricing_snapshot tidak pernah diubah; nilai efektif = snapshot x rasio
 * penyesuaian aktif grup transaksi. Helper ini dipakai semua konsumen
 * (tabel transaksi, overview, dashboard, laporan, surat) agar konsisten.
 */
export interface TotalAdjustment {
  transaction_key: string;
  transaction_id: string | null;
  reference_no: string | null;
  computed_total: number;
  adjusted_total: number;
  ratio: number;
  reason: string;
  created_by_name: string | null;
  created_at: string;
}

export interface PricedRow {
  transaction_id?: string | null;
  reference_no?: string | null;
  id?: string;
  pricing_snapshot: Record<string, unknown> | null;
}

/** Kunci grup transaksi — persis seperti pengelompokan di BrandingTransactionTable. */
export function groupKeyOf(row: { transaction_id?: string | null; reference_no?: string | null; id?: string }): string {
  return row.transaction_id || row.reference_no || `TANPA-REFERENSI-${row.id ?? ""}`;
}

export async function loadActiveAdjustments(
  supabase: SupabaseClient,
): Promise<Map<string, TotalAdjustment>> {
  const { data } = await supabase
    .from("branding_total_adjustments")
    .select("transaction_key, transaction_id, reference_no, computed_total, adjusted_total, ratio, reason, created_by_name, created_at")
    .eq("is_active", true);
  const map = new Map<string, TotalAdjustment>();
  for (const r of (data ?? []) as TotalAdjustment[]) {
    map.set(r.transaction_key, { ...r, ratio: Number(r.ratio), computed_total: Number(r.computed_total), adjusted_total: Number(r.adjusted_total) });
  }
  return map;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function scaleSnapshot<T extends Record<string, unknown> | null>(snap: T, ratio: number): T {
  if (!snap || ratio === 1) return snap;
  const s = { ...(snap as Record<string, unknown>) };
  for (const k of ["basePrice", "ppn", "totalWithPpn", "monthlyRevenue"]) {
    if (typeof s[k] === "number") s[k] = round2((s[k] as number) * ratio);
  }
  return s as T;
}

/** Kembalikan baris-baris dengan pricing_snapshot yang sudah diskalakan
 *  sesuai penyesuaian aktif grupnya (baris asli tidak diubah). */
export function applyAdjustments<T extends PricedRow>(rows: T[], adjustments: Map<string, TotalAdjustment>): T[] {
  if (!adjustments.size) return rows;
  return rows.map((row) => {
    const adj = adjustments.get(groupKeyOf(row));
    if (!adj || adj.ratio === 1) return row;
    return { ...row, pricing_snapshot: scaleSnapshot(row.pricing_snapshot, adj.ratio) };
  });
}
