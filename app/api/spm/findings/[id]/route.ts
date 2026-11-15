import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FINDING_STATUSES } from "@/lib/spm";

/** Ubah status rekonsiliasi / penjelasan / bukti satu temuan. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await apiContext("spm.manage");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "wajib" }, { status: 400 });

  const patch: Record<string, unknown> = {
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!(FINDING_STATUSES as readonly string[]).includes(status))
      return NextResponse.json({ error: "status" }, { status: 400 });
    patch.status = status;
  }
  if (body.explanation !== undefined)
    patch.explanation = String(body.explanation).slice(0, 2000) || null;
  if (body.operatorEvidence !== undefined)
    patch.operator_evidence = String(body.operatorEvidence).slice(0, 4000) || null;
  if (body.dishubEvidence !== undefined)
    patch.dishub_evidence = String(body.dishubEvidence).slice(0, 4000) || null;
  if (body.quantity !== undefined) {
    const q = Number(body.quantity);
    if (!Number.isFinite(q) || q <= 0)
      return NextResponse.json({ error: "kuantitas" }, { status: 400 });
    patch.quantity = q;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spm_findings")
    .update(patch)
    .eq("id", id)
    .select("id, status")
    .single();
  if (error || !data) return NextResponse.json({ error: "db" }, { status: 500 });
  if (body.status !== undefined) {
    await supabase.rpc("log_audit", {
      p_module: "spm",
      p_action: "spm.finding.status",
      p_entity_type: "spm_finding",
      p_entity_id: id,
      p_detail: { status: data.status },
    });
  }
  return NextResponse.json({ ok: true });
}
