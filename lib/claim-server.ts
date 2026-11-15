import { createClient } from "@/lib/supabase/server";
import { calculateClaimTotals, calculateItemFinancials } from "@/lib/claim";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ClaimBundle {
  claim: Record<string, unknown> & {
    id: string; status: string; operator_name: string; pic_name: string; pic_position: string;
    period_month: number; period_year: number; profit_percentage: number;
    total_operational_cost: number; current_version: number; claim_number: string;
    vehicle_type_id: string; regulation_version_id: string; notes: string | null;
    total_verified_operational_cost: number | null; calculated_verified_subsidy: number | null;
    verified_at: string | null;
  };
  items: Array<{
    id: string; cost_category_id: string; nominal_base: number; tax_type: string; tax_rate: number;
    calculated_tax: number; calculated_total: number; completion_status: string;
    verified_amount: number | null;
    category: { code: string; name: string; category_type: string; parent_id: string | null; sort_order: number; level: number; is_input: boolean };
  }>;
  revenues: Array<{ id: string; revenue_code: string; revenue_name: string; category: string; nominal: number; verified_amount: number | null }>;
  documents: Array<{ id: string; claim_item_id: string; document_type_id: string; storage_path: string | null; original_filename: string | null }>;
  requirements: Array<{ cost_category_id: string; document_type_id: string; is_mandatory: boolean; max_size_bytes: number }>;
}

export async function loadClaimBundle(supabase: Supabase, claimId: string): Promise<ClaimBundle | null> {
  const { data: claim } = await supabase.from("claims").select("*").eq("id", claimId).single();
  if (!claim) return null;
  const [{ data: items }, { data: revenues }, { data: documents }] = await Promise.all([
    supabase
      .from("claim_items")
      .select("*, category:claim_cost_categories(code, name, category_type, parent_id, sort_order, level, is_input)")
      .eq("claim_id", claimId),
    supabase.from("claim_revenues").select("*").eq("claim_id", claimId),
    supabase.from("claim_item_documents").select("*").eq("claim_id", claimId),
  ]);
  const catIds = (items ?? []).map((i) => i.cost_category_id);
  const { data: requirements } = catIds.length
    ? await supabase.from("claim_document_requirements").select("*").in("cost_category_id", catIds)
    : { data: [] };
  return {
    claim: claim as ClaimBundle["claim"],
    items: (items ?? []) as unknown as ClaimBundle["items"],
    revenues: (revenues ?? []) as ClaimBundle["revenues"],
    documents: (documents ?? []) as ClaimBundle["documents"],
    requirements: (requirements ?? []) as ClaimBundle["requirements"],
  };
}

/**
 * Hitung ulang total klaim + status kelengkapan item; simpan.
 * Mengembalikan null bila langkah tulis mana pun gagal ATAU total yang
 * tersimpan tidak sama dengan hasil hitung — pemanggil WAJIB menampilkan
 * galat, tidak boleh mengklaim sukses (total basi/Rp 0 pernah tampil
 * sebagai "berhasil" karena galat update diabaikan di sini).
 */
export async function recalcClaim(supabase: Supabase, claimId: string): Promise<ClaimBundle | null> {
  const bundle = await loadClaimBundle(supabase, claimId);
  if (!bundle) return null;
  // Perbarui status kelengkapan secara MASSAL per nilai status (satu
  // panggilan per status, bukan per item) — alasan yang sama dengan
  // simpan item: panggilan per baris dalam satu request kehabisan
  // anggaran subrequest dan dulu galatnya diabaikan, sehingga total
  // header tidak pernah sampai ter-update (kartu ringkasan Rp 0).
  const statusChanges = new Map<string, string[]>();
  for (const item of bundle.items) {
    const reqs = bundle.requirements.filter((r) => r.cost_category_id === item.cost_category_id && r.is_mandatory);
    const uploaded = bundle.documents.filter(
      (d) => d.claim_item_id === item.id && d.storage_path,
    );
    const missing = reqs.filter(
      (r) => !uploaded.some((d) => d.document_type_id === r.document_type_id),
    );
    const status =
      Number(item.nominal_base) <= 0 ? "EMPTY" : missing.length === 0 ? "COMPLETE" : "IN_PROGRESS";
    if (status !== item.completion_status) {
      const arr = statusChanges.get(status) ?? [];
      arr.push(item.id);
      statusChanges.set(status, arr);
      item.completion_status = status;
    }
  }
  for (const [status, ids] of statusChanges) {
    const { error } = await supabase
      .from("claim_items")
      .update({ completion_status: status })
      .in("id", ids);
    if (error) return null;
  }
  const totals = calculateClaimTotals(
    bundle.items.map((i) => ({ categoryType: i.category.category_type, calculatedTotal: Number(i.calculated_total) })),
    bundle.revenues.map((r) => ({ category: r.category, nominal: Number(r.nominal) })),
    Number(bundle.claim.profit_percentage),
  );
  const { error: updateError } = await supabase
    .from("claims")
    .update({
      total_direct_cost: totals.totalDirectCost,
      total_indirect_cost: totals.totalIndirectCost,
      total_base_cost: totals.totalBaseCost,
      total_profit: totals.totalProfit,
      total_supporting_cost: totals.totalSupportingCost,
      total_operational_cost: totals.totalOperationalCost,
      total_revenue: totals.totalRevenue,
      calculated_subsidy: totals.calculatedSubsidy,
    })
    .eq("id", claimId);
  if (updateError) return null;
  // Verifikasi pasca-tulis: total tersimpan harus sama dengan hasil hitung.
  const { data: check, error: checkError } = await supabase
    .from("claims")
    .select("total_direct_cost, total_indirect_cost, total_base_cost, total_profit, total_supporting_cost, total_operational_cost, total_revenue, calculated_subsidy")
    .eq("id", claimId)
    .single();
  if (checkError || !check) return null;
  const EPS = 0.01;
  const pairs: Array<[number, number]> = [
    [Number(check.total_direct_cost), totals.totalDirectCost],
    [Number(check.total_indirect_cost), totals.totalIndirectCost],
    [Number(check.total_base_cost), totals.totalBaseCost],
    [Number(check.total_profit), totals.totalProfit],
    [Number(check.total_supporting_cost), totals.totalSupportingCost],
    [Number(check.total_operational_cost), totals.totalOperationalCost],
    [Number(check.total_revenue), totals.totalRevenue],
    [Number(check.calculated_subsidy), totals.calculatedSubsidy],
  ];
  if (pairs.some(([stored, computed]) => Math.abs(stored - computed) > EPS)) return null;
  return bundle;
}

/**
 * Hitung ulang total TERVERIFIKASI dari verified_amount per item dan per
 * baris pendapatan (rumus yang sama dengan total usulan:
 * calculateClaimTotals), simpan ke header + verified_at, lalu verifikasi
 * pasca-tulis. verified_amount NULL dihitung 0 — pemanggil (action
 * "verified") selalu menulis seluruh baris lebih dulu, jadi total hanya
 * bermakna setelah simpan terverifikasi. Mengembalikan null bila langkah
 * tulis/verifikasi mana pun gagal; pemanggil WAJIB menampilkan galat.
 */
export async function recalcVerifiedClaim(supabase: Supabase, claimId: string): Promise<ClaimBundle | null> {
  const bundle = await loadClaimBundle(supabase, claimId);
  if (!bundle) return null;
  const totals = calculateClaimTotals(
    bundle.items.map((i) => ({ categoryType: i.category.category_type, calculatedTotal: Number(i.verified_amount ?? 0) })),
    bundle.revenues.map((r) => ({ category: r.category, nominal: Number(r.verified_amount ?? 0) })),
    Number(bundle.claim.profit_percentage),
  );
  const { error: updateError } = await supabase
    .from("claims")
    .update({
      total_verified_operational_cost: totals.totalOperationalCost,
      calculated_verified_subsidy: totals.calculatedSubsidy,
      verified_at: new Date().toISOString(),
    })
    .eq("id", claimId);
  if (updateError) return null;
  const { data: check, error: checkError } = await supabase
    .from("claims")
    .select("total_verified_operational_cost, calculated_verified_subsidy")
    .eq("id", claimId)
    .single();
  if (checkError || !check) return null;
  const EPS = 0.01;
  if (Math.abs(Number(check.total_verified_operational_cost) - totals.totalOperationalCost) > EPS
    || Math.abs(Number(check.calculated_verified_subsidy) - totals.calculatedSubsidy) > EPS)
    return null;
  return bundle;
}

export interface ValidationResult {
  /** true bila seluruh SYARAT WAJIB terpenuhi — dokumen kurang tidak menghalangi. */
  isValid: boolean;
  /** Syarat wajib bisnis: menghalangi pengajuan bila belum terpenuhi. */
  blockingErrors: string[];
  /** Catatan kelengkapan: ditampilkan, tidak menghalangi pengajuan. */
  warnings: string[];
  /** Komponen biaya dengan dokumen bukti belum lengkap (nama dokumen disertakan). */
  itemIssues: Array<{ code: string; name: string; missing: number; missingDocs: string[] }>;
}

/**
 * Validasi pengajuan (revisi 1.0.1 D.3 — dua tingkat):
 * - WAJIB (blocking): identitas pengajuan (operator, PIC, jabatan), periode
 *   valid, tidak ada nominal negatif, dan minimal satu komponen biaya terisi.
 * - KELENGKAPAN (warning): dokumen bukti yang belum diunggah — termasuk yang
 *   ditandai mandatory di master data — TIDAK lagi menghalangi simpan/kirim;
 *   kekurangannya dicatat dan ditampilkan sebagai catatan kelengkapan, dan
 *   tetap terlihat oleh verifikator.
 */
export async function validateClaim(supabase: Supabase, claimId: string): Promise<ValidationResult> {
  const bundle = await loadClaimBundle(supabase, claimId);
  if (!bundle) return { isValid: false, blockingErrors: ["Klaim tidak ditemukan."], warnings: [], itemIssues: [] };
  const c = bundle.claim;
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  if (!c.operator_name?.trim()) blockingErrors.push("Nama Operator Angkutan wajib diisi.");
  if (!c.pic_name?.trim()) blockingErrors.push("Nama Penanggung Jawab (PIC) wajib diisi.");
  if (!c.pic_position?.trim()) blockingErrors.push("Jabatan Penanggung Jawab (PIC) wajib diisi.");
  if (!c.period_month || c.period_month < 1 || c.period_month > 12)
    blockingErrors.push("Bulan periode pengajuan tidak valid.");
  if (!c.period_year || c.period_year < 2020) blockingErrors.push("Tahun periode pengajuan tidak valid.");

  const { data: docTypes } = await supabase.from("claim_document_types").select("id, name, code");
  const docTypeName = new Map((docTypes ?? []).map((d) => [d.id, `${d.name} (${d.code})`]));

  const itemIssues: ValidationResult["itemIssues"] = [];
  let filled = 0;
  for (const item of bundle.items) {
    const nominal = Number(item.nominal_base);
    if (nominal < 0)
      blockingErrors.push(`Nominal pada komponen "${item.category.code} ${item.category.name}" tidak boleh negatif.`);
    if (nominal <= 0) continue;
    filled++;
    const reqs = bundle.requirements.filter(
      (r) => r.cost_category_id === item.cost_category_id && r.is_mandatory,
    );
    const missing = reqs.filter(
      (r) =>
        !bundle.documents.some(
          (d) => d.claim_item_id === item.id && d.document_type_id === r.document_type_id && d.storage_path,
        ),
    );
    if (missing.length > 0)
      itemIssues.push({
        code: item.category.code,
        name: item.category.name,
        missing: missing.length,
        missingDocs: missing.map((r) => docTypeName.get(r.document_type_id) ?? "Dokumen"),
      });
  }
  if (itemIssues.length > 0) {
    const totalMissing = itemIssues.reduce((s, i) => s + i.missing, 0);
    warnings.push(
      `${totalMissing} dokumen bukti pada ${itemIssues.length} komponen biaya belum diunggah (lihat daftar kelengkapan). Pengajuan tetap dapat dikirim.`,
    );
  }
  if (filled === 0) blockingErrors.push("Belum ada komponen biaya yang diisi.");
  // Konsistensi total: total header klaim harus sama dengan hasil hitung
  // dari item + pendapatan yang tersimpan. Klaim dengan total biaya
  // operasional Rp 0, atau header yang basi/tidak konsisten (pernah terjadi:
  // item tersimpan Rp 2,8 miliar tetapi kartu ringkasan dan header Rp 0),
  // TIDAK boleh dinyatakan dapat diajukan.
  const computed = calculateClaimTotals(
    bundle.items.map((i) => ({ categoryType: i.category.category_type, calculatedTotal: Number(i.calculated_total) })),
    bundle.revenues.map((r) => ({ category: r.category, nominal: Number(r.nominal) })),
    Number(c.profit_percentage),
  );
  if (computed.totalOperationalCost <= 0)
    blockingErrors.push("Total Biaya Operasional masih Rp 0 — klaim tidak dapat diajukan.");
  else {
    const header = c as unknown as Record<string, unknown>;
    const EPS = 0.01;
    const headerPairs: Array<[number, number]> = [
      [Number(header.total_direct_cost ?? 0), computed.totalDirectCost],
      [Number(header.total_indirect_cost ?? 0), computed.totalIndirectCost],
      [Number(header.total_supporting_cost ?? 0), computed.totalSupportingCost],
      [Number(header.total_operational_cost ?? 0), computed.totalOperationalCost],
      [Number(header.total_revenue ?? 0), computed.totalRevenue],
      [Number(header.calculated_subsidy ?? 0), computed.calculatedSubsidy],
    ];
    if (headerPairs.some(([stored, want]) => Math.abs(stored - want) > EPS))
      blockingErrors.push(
        "Total klaim tidak konsisten dengan item yang tersimpan — simpan ulang item biaya dan pendapatan agar total dihitung ulang, lalu periksa kembali sebelum mengajukan.",
      );
  }
  if (bundle.revenues.length === 0)
    warnings.push("Belum ada data pendapatan operasional (tiket/branding).");
  else if (bundle.revenues.reduce((s, r) => s + Number(r.nominal), 0) <= 0)
    warnings.push("Total pendapatan operasional tercatat Rp 0.");
  return { isValid: blockingErrors.length === 0, blockingErrors, warnings, itemIssues };
}

export { calculateItemFinancials };
