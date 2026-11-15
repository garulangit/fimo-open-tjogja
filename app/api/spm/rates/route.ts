import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const ctx = await apiContext("spm.view");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spm_violation_rates")
    .select(
      "id, jenis_data, nomor_pelanggaran, kode_pelanggaran, deskripsi_pelanggaran, amount, basis_pengenaan, sanksi_tindakan, keterangan, halaman_pdf, is_verified, active",
    )
    .order("jenis_data")
    .order("nomor_pelanggaran");
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  return NextResponse.json({ rates: data ?? [] });
}

/** Tambah/ubah satu tarif master (untuk tarif resmi hasil verifikasi). */
export async function POST(req: NextRequest) {
  const ctx = await apiContext("spm.manage");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const code = String(body?.kode_pelanggaran ?? "").trim();
  const desc = String(body?.deskripsi_pelanggaran ?? "").trim();
  if (!code || !desc)
    return NextResponse.json({ error: "wajib" }, { status: 400 });
  const amountRaw = body?.amount;
  const amount =
    amountRaw === null || amountRaw === undefined || amountRaw === ""
      ? null
      : Number(amountRaw);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0))
    return NextResponse.json({ error: "nominal" }, { status: 400 });

  const supabase = await createClient();
  const row = {
    jenis_data: String(body?.jenis_data ?? "OPERASIONAL").trim() || "OPERASIONAL",
    nomor_pelanggaran: String(body?.nomor_pelanggaran ?? "") || null,
    kode_pelanggaran: code,
    deskripsi_pelanggaran: desc,
    amount,
    basis_pengenaan: String(body?.basis_pengenaan ?? "") || null,
    sanksi_tindakan: String(body?.sanksi_tindakan ?? "") || null,
    keterangan: String(body?.keterangan ?? "") || null,
    halaman_pdf: String(body?.halaman_pdf ?? "") || null,
    is_verified: Boolean(body?.is_verified),
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("spm_violation_rates")
    .upsert(row, { onConflict: "kode_pelanggaran" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  await supabase.rpc("log_audit", {
    p_module: "spm",
    p_action: "spm.rate.upsert",
    p_entity_type: "spm_violation_rate",
    p_entity_id: data.id,
    p_detail: { code, amount, is_verified: row.is_verified },
  });
  return NextResponse.json({ ok: true, id: data.id });
}
