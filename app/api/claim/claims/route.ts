import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiContext } from "@/lib/auth";
import { claimNumberPrefix } from "@/lib/claim";

export async function POST(request: Request) {
  const ctx = await apiContext("claim.claim.create");
  if (!ctx) return NextResponse.redirect(new URL("/claim/list?err=izin", new URL(request.url).origin), 303);
  const supabase = await createClient();
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const back = (p: string) => NextResponse.redirect(new URL(p, BASE), 303);
  const form = await request.formData();
  const s = (k: string) => String(form.get(k) ?? "").trim();

  const vehicleTypeId = s("vehicle_type_id");
  const regulationVersionId = s("regulation_version_id");
  const periodMonth = Number(s("period_month"));
  const periodYear = Number(s("period_year"));
  if (!vehicleTypeId || !regulationVersionId || !periodMonth || !periodYear || !s("operator_name"))
    return back("/claim/list?err=" + encodeURIComponent("Jenis kendaraan, regulasi, periode, dan operator wajib diisi."));

  const { data: vehicle } = await supabase
    .from("claim_vehicle_types").select("code").eq("id", vehicleTypeId).single();
  if (!vehicle) return back("/claim/list?err=" + encodeURIComponent("Jenis kendaraan tidak ditemukan."));
  const prefix = `${claimNumberPrefix(vehicle.code)}-${periodYear}-`;

  // Nomor berikutnya = MAX(seq) + 1 dari nomor yang benar-benar ada, BUKAN
  // COUNT + 1: celah akibat klaim terhapus tidak boleh membuat nomor lama
  // terpakai ulang (tabrakan unique constraint). Galat baca di sini fatal —
  // jangan pernah lanjut dengan nomor tebakan.
  const readMaxSeq = async (): Promise<number | null> => {
    const { data: existing, error: readError } = await supabase
      .from("claims").select("claim_number").like("claim_number", `${prefix}%`);
    if (readError) return null;
    let max = 0;
    for (const row of existing ?? []) {
      const n = Number(String(row.claim_number).slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  };

  // Insert dengan retry: bila nomor keburu dipakai proses lain
  // (unique_violation 23505), hitung ulang dari MAX terbaru lalu coba lagi.
  let claim: { id: string } | null = null;
  let claimNumber = "";
  let lastError = "";
  for (let attempt = 0; attempt < 5 && !claim; attempt++) {
    const maxSeq = await readMaxSeq();
    if (maxSeq === null)
      return back("/claim/list?err=" + encodeURIComponent("Gagal membuat klaim: penomoran klaim tidak dapat dibaca. Coba lagi."));
    claimNumber = `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
    const { data, error } = await supabase
      .from("claims")
      .insert({
        claim_number: claimNumber,
        vehicle_type_id: vehicleTypeId,
        regulation_version_id: regulationVersionId,
        period_month: periodMonth,
        period_year: periodYear,
        operator_name: s("operator_name"),
        pic_name: s("pic_name") || "-",
        pic_position: s("pic_position") || "-",
        profit_percentage: Number(s("profit_percentage") || 7),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (!error && data) claim = data as { id: string };
    else {
      lastError = error?.message ?? "";
      if (error?.code !== "23505") break;
    }
  }
  if (!claim)
    return back("/claim/list?err=" + encodeURIComponent("Gagal membuat klaim: " + lastError));

  // Item kosong untuk semua kategori input pada regulasi+kendaraan ini (pola wizard legacy)
  const { data: cats } = await supabase
    .from("claim_cost_categories")
    .select("id")
    .eq("regulation_version_id", regulationVersionId)
    .eq("vehicle_type_id", vehicleTypeId)
    .eq("is_input", true)
    .eq("active", true);
  if (cats?.length) {
    await supabase.from("claim_items").insert(
      cats.map((c) => ({ claim_id: claim.id, cost_category_id: c.id })),
    );
  }
  await supabase.rpc("log_audit", {
    p_module: "claim", p_action: "claim.create", p_entity_type: "claim",
    p_entity_id: claim.id, p_detail: { claim_number: claimNumber },
  });
  return back(`/claim/${claim.id}?ok=` + encodeURIComponent(`Klaim ${claimNumber} dibuat.`) + "&summary=1");
}
