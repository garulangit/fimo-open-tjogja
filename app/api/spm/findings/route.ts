import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { durationMin, operatorForFleet, type SpmFinding } from "@/lib/spm";

interface FindingRow {
  id: string;
  occurred_date: string;
  occurred_time: string | null;
  fleet_no: string;
  violation_code: string;
  operator_reported: string | null;
  operator_mapped: string;
  status: SpmFinding["status"];
  dishub_evidence: string | null;
  operator_evidence: string | null;
  source_ref: string | null;
  explanation: string | null;
  quantity: number;
  dishub_stop_at: string | null;
  dishub_resume_at: string | null;
  operator_stop_at: string | null;
  operator_resume_at: string | null;
  dishub_duration_min: number | null;
  operator_duration_min: number | null;
}

export async function GET(req: NextRequest) {
  const ctx = await apiContext("spm.view");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const year = req.nextUrl.searchParams.get("year");
  const supabase = await createClient();
  let query = supabase
    .from("spm_findings")
    .select(
      "id, occurred_date, occurred_time, fleet_no, violation_code, operator_reported, operator_mapped, status, dishub_evidence, operator_evidence, source_ref, explanation, quantity, dishub_stop_at, dishub_resume_at, operator_stop_at, operator_resume_at, dishub_duration_min, operator_duration_min",
    )
    .order("occurred_date", { ascending: false });
  if (year && /^\d{4}$/.test(year)) {
    query = query
      .gte("occurred_date", `${year}-01-01`)
      .lte("occurred_date", `${year}-12-31`);
  }
  const [{ data, error }, { data: rates }] = await Promise.all([
    query,
    supabase.from("spm_violation_rates").select("kode_pelanggaran, amount"),
  ]);
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  const amountByCode = new Map(
    (rates ?? []).map((r) => [r.kode_pelanggaran, Number(r.amount) || 0]),
  );
  const findings: SpmFinding[] = (data as FindingRow[] | null ?? []).map((r) => ({
    id: r.id,
    date: r.occurred_date,
    time: r.occurred_time,
    fleet: r.fleet_no,
    type: r.violation_code,
    operator: r.operator_reported ?? r.operator_mapped,
    mappedOperator: r.operator_mapped,
    status: r.status,
    dishub: r.dishub_evidence ?? "",
    operatorData: r.operator_evidence ?? "",
    sourceCode: r.source_ref ?? "",
    explanation: r.explanation ?? "",
    quantity: Number(r.quantity) || 1,
    amount: amountByCode.get(r.violation_code) ?? 0,
    dishubStopAt: r.dishub_stop_at,
    dishubResumeAt: r.dishub_resume_at,
    operatorStopAt: r.operator_stop_at,
    operatorResumeAt: r.operator_resume_at,
    dishubDurationMin: r.dishub_duration_min,
    operatorDurationMin: r.operator_duration_min,
  }));
  return NextResponse.json({ findings });
}

interface ImportRow {
  sourceRef?: string;
  date?: string;
  time?: string;
  fleet?: string;
  code?: string;
  evidence?: string;
  /** Jam berhenti / jam jalan "HH:MM" (kolom jam_berhenti / jam_jalan CSV). */
  stopAt?: string;
  resumeAt?: string;
}

/**
 * Aturan 3 jam (migration 0019, pola Bos): OP-006 dengan durasi operator
 * < 180 menit -> 'Klarifikasi Diajukan' (gugur dari penetapan). Tepat 180
 * menit = tetap pelanggaran. Hanya berlaku untuk OP-006.
 */
const REKON_OP006_MAX_MIN = 180;

/**
 * Impor hasil pemetaan CSV dari browser.
 * DISHUB: membuat temuan baru (duplikat ditolak indeks unik, dihitung).
 * OPERATOR: mencocokkan temuan (tanggal+lambung+kode) lalu mengisi bukti sisi
 * operator — inilah sisi kedua rekonsiliasi dua arah.
 */
export async function POST(req: NextRequest) {
  const ctx = await apiContext("spm.manage");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as {
    source?: string;
    operatorName?: string;
    fileName?: string;
    rawCsv?: string;
    rows?: ImportRow[];
  } | null;
  const source = body?.source === "OPERATOR" ? "OPERATOR" : "DISHUB";
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!body?.fileName || rows.length === 0)
    return NextResponse.json({ error: "wajib" }, { status: 400 });

  const supabase = await createClient();
  const { data: rateRows } = await supabase
    .from("spm_violation_rates")
    .select("kode_pelanggaran");
  const knownCodes = new Set((rateRows ?? []).map((r) => r.kode_pelanggaran));

  const { data: batch, error: batchError } = await supabase
    .from("spm_import_batches")
    .insert({
      source,
      operator_name: source === "OPERATOR" ? body.operatorName ?? null : null,
      file_name: String(body.fileName).slice(0, 200),
      row_count: rows.length,
      raw_csv: typeof body.rawCsv === "string" ? body.rawCsv.slice(0, 2_000_000) : null,
      imported_by: ctx.userId,
    })
    .select("id")
    .single();
  if (batchError || !batch)
    return NextResponse.json({ error: "db" }, { status: 500 });

  let inserted = 0;
  let duplicates = 0;
  let errors = 0;
  let matched = 0;
  let unmatched = 0;
  let clarified = 0;
  let stillViolation = 0;

  for (const row of rows) {
    const date = String(row.date ?? "").slice(0, 10);
    const fleet = String(row.fleet ?? "").trim().toUpperCase();
    const code = String(row.code ?? "").trim().toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !fleet || !knownCodes.has(code)) {
      errors++;
      continue;
    }
    const stopAt = String(row.stopAt ?? "").trim() || null;
    const resumeAt = String(row.resumeAt ?? "").trim() || null;
    const duration = durationMin(stopAt, resumeAt);
    if (source === "DISHUB") {
      const { error } = await supabase.from("spm_findings").insert({
        batch_id: batch.id,
        source_ref: String(row.sourceRef ?? "").trim() || null,
        occurred_date: date,
        occurred_time: String(row.time ?? "").trim() || null,
        fleet_no: fleet,
        violation_code: code,
        operator_mapped: operatorForFleet(fleet),
        dishub_evidence: String(row.evidence ?? "").trim() || null,
        dishub_stop_at: stopAt,
        dishub_resume_at: resumeAt,
        dishub_duration_min: duration,
        created_by: ctx.userId,
      });
      if (error) {
        if (error.code === "23505") duplicates++;
        else errors++;
      } else inserted++;
    } else {
      const { data: found } = await supabase
        .from("spm_findings")
        .select("id, violation_code")
        .eq("occurred_date", date)
        .eq("fleet_no", fleet)
        .eq("violation_code", code)
        .limit(1);
      if (!found || found.length === 0) {
        unmatched++;
        continue;
      }
      const patch: Record<string, unknown> = {
        operator_evidence: String(row.evidence ?? "").trim() || null,
        operator_reported: body.operatorName ?? null,
        operator_stop_at: stopAt,
        operator_resume_at: resumeAt,
        operator_duration_min: duration,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      };
      // Aturan otomatis: OP-006 + durasi operator < 180 menit -> Klarifikasi Diajukan.
      const isClarified =
        found[0].violation_code === "OP-006" &&
        duration !== null &&
        duration < REKON_OP006_MAX_MIN;
      if (isClarified) patch.status = "Klarifikasi Diajukan";
      const { error } = await supabase
        .from("spm_findings")
        .update(patch)
        .eq("id", found[0].id);
      if (error) errors++;
      else {
        matched++;
        if (isClarified) clarified++;
        else stillViolation++;
      }
    }
  }

  await supabase
    .from("spm_import_batches")
    .update({
      inserted_count: source === "DISHUB" ? inserted : matched,
      duplicate_count: duplicates,
      error_count: errors + (source === "OPERATOR" ? unmatched : 0),
    })
    .eq("id", batch.id);
  await supabase.rpc("log_audit", {
    p_module: "spm",
    p_action: "spm.import",
    p_entity_type: "spm_import_batch",
    p_entity_id: batch.id,
    p_detail: {
      source,
      file: body.fileName,
      rows: rows.length,
      inserted,
      matched,
      unmatched,
      duplicates,
      errors,
      clarified,
      stillViolation,
    },
  });
  return NextResponse.json({
    ok: true,
    batchId: batch.id,
    inserted,
    matched,
    unmatched,
    duplicates,
    errors,
    clarified,
    stillViolation,
  });
}
