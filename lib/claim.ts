// Logika Klaim — port setia calculation-engine.ts + validation-engine.ts legacy.
// Jumlah baris form Pendapatan Operasional di halaman detail klaim.
// UI (page.tsx) dan server action (route.ts) WAJIB memakai angka yang
// sama — data Klaim Subsidi 2026 butuh s.d. 20 baris per klaim.
export const REVENUE_FORM_ROWS = 30;
export const CLAIM_STATUSES = [
  "DRAFT", "SUBMITTED", "IN_REVIEW", "REVISION_REQUIRED", "APPROVED", "REJECTED", "COMPLETED",
] as const;
export const CLAIM_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  IN_REVIEW: "Dalam Verifikasi",
  REVISION_REQUIRED: "Perlu Revisi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  COMPLETED: "Selesai",
};
export const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Pembulatan HALF_UP 2 desimal ala decimal.js legacy. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface ItemCalc { calculatedTax: number; calculatedTotal: number; taxRate: number }

export function calculateItemFinancials(
  nominalBase: number,
  taxType: string,
  taxRate = 0,
): ItemCalc {
  let rate = 0;
  if (taxType === "PPN_11") rate = 11;
  else if (taxType === "CUSTOM") rate = taxRate || 0;
  const tax = round2((nominalBase * rate) / 100);
  return { calculatedTax: tax, calculatedTotal: round2(nominalBase + tax), taxRate: rate };
}

export interface ClaimTotals {
  totalDirectCost: number; totalIndirectCost: number; totalBaseCost: number;
  totalProfit: number; totalSupportingCost: number; totalOperationalCost: number;
  totalRevenue: number; calculatedSubsidy: number;
}

export function calculateClaimTotals(
  items: Array<{ categoryType: string; calculatedTotal: number }>,
  revenues: Array<{ category: string; nominal: number }>,
  profitPercentage: number,
): ClaimTotals {
  let direct = 0, indirect = 0, supporting = 0;
  for (const it of items) {
    if (it.categoryType === "DIRECT_COST") direct += it.calculatedTotal;
    else if (it.categoryType === "INDIRECT_COST") indirect += it.calculatedTotal;
    else if (it.categoryType === "SUPPORTING_COST") supporting += it.calculatedTotal;
  }
  direct = round2(direct); indirect = round2(indirect); supporting = round2(supporting);
  const base = round2(direct + indirect);
  const profit = round2((base * profitPercentage) / 100);
  const operational = round2(base + profit + supporting);
  let ticket = 0, branding = 0;
  for (const r of revenues) {
    if (r.category === "TICKET") ticket += r.nominal;
    else branding += r.nominal;
  }
  const totalRevenue = round2(ticket + branding);
  return {
    totalDirectCost: direct,
    totalIndirectCost: indirect,
    totalBaseCost: base,
    totalProfit: profit,
    totalSupportingCost: supporting,
    totalOperationalCost: operational,
    totalRevenue,
    calculatedSubsidy: round2(operational - totalRevenue),
  };
}

export function claimNumberPrefix(vehicleCode: string): string {
  return `CLM-${(vehicleCode || "X").charAt(0).toUpperCase()}`;
}
