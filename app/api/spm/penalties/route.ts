import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const ctx = await apiContext("spm.view");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const year = req.nextUrl.searchParams.get("year");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spm_penalties")
    .select(
      "id, finding_id, code_snapshot, amount_snapshot, basis_snapshot, operator_mapped, doc_status, created_at, spm_findings!inner(occurred_date, fleet_no, source_ref)",
    )
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  type Row = {
    id: string;
    finding_id: string;
    code_snapshot: string;
    amount_snapshot: number;
    basis_snapshot: string | null;
    operator_mapped: string;
    doc_status: string;
    spm_findings: { occurred_date: string; fleet_no: string; source_ref: string | null };
  };
  const penalties = ((data as unknown as Row[] | null) ?? [])
    .filter(
      (p) => !year || p.spm_findings.occurred_date.startsWith(year),
    )
    .map((p) => ({
      id: p.id,
      findingId: p.finding_id,
      code: p.code_snapshot,
      amount: Number(p.amount_snapshot) || 0,
      basis: p.basis_snapshot ?? "",
      operator: p.operator_mapped,
      docStatus: p.doc_status,
      date: p.spm_findings.occurred_date,
      fleet: p.spm_findings.fleet_no,
      sourceRef: p.spm_findings.source_ref ?? "",
    }));
  return NextResponse.json({ penalties });
}

/**
 * Penetapan: buat snapshot denda untuk semua temuan Disetujui yang operatornya
 * terklasifikasi dan belum punya snapshot. Nominal = tarif master saat ini x
 * kuantitas temuan; snapshot membeku dan tidak berubah saat master berubah.
 * (Sejak migration 0019, syarat penetapan adalah 'Disetujui', bukan 'Verified'.)
 */
export async function POST(req: NextRequest) {
  const ctx = await apiContext("spm.manage");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { year?: string } | null;
  const year = String(body?.year ?? "");
  const supabase = await createClient();

  let query = supabase
    .from("spm_findings")
    .select("id, violation_code, operator_mapped, quantity")
    .eq("status", "Disetujui")
    .neq("operator_mapped", "Belum terklasifikasi");
  if (/^\d{4}$/.test(year)) {
    query = query
      .gte("occurred_date", `${year}-01-01`)
      .lte("occurred_date", `${year}-12-31`);
  }
  const [{ data: findings }, { data: rates }, { data: existing }] =
    await Promise.all([
      query,
      supabase
        .from("spm_violation_rates")
        .select("id, kode_pelanggaran, amount, basis_pengenaan"),
      supabase.from("spm_penalties").select("finding_id"),
    ]);
  const rateByCode = new Map(
    (rates ?? []).map((r) => [r.kode_pelanggaran, r]),
  );
  const done = new Set((existing ?? []).map((p) => p.finding_id));

  let created = 0;
  let skippedExisting = 0;
  let skippedNoRate = 0;
  for (const f of findings ?? []) {
    if (done.has(f.id)) {
      skippedExisting++;
      continue;
    }
    const rate = rateByCode.get(f.violation_code);
    if (!rate || rate.amount === null) {
      skippedNoRate++;
      continue;
    }
    const { error } = await supabase.from("spm_penalties").insert({
      finding_id: f.id,
      rate_id: rate.id,
      code_snapshot: f.violation_code,
      amount_snapshot: Number(rate.amount) * (Number(f.quantity) || 1),
      basis_snapshot: rate.basis_pengenaan,
      operator_mapped: f.operator_mapped,
      generated_by: ctx.userId,
    });
    if (error) skippedExisting++;
    else created++;
  }
  if (created > 0) {
    await supabase.rpc("log_audit", {
      p_module: "spm",
      p_action: "spm.penalties.generate",
      p_entity_type: "spm_penalty",
      p_entity_id: year || "all",
      p_detail: { created, skippedExisting, skippedNoRate },
    });
  }
  return NextResponse.json({ ok: true, created, skippedExisting, skippedNoRate });
}
