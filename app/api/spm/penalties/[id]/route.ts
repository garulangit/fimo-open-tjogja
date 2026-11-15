import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PENALTY_DOC_STATUSES } from "@/lib/spm";

/** Ubah status dokumen penetapan (Draft -> Under Review -> Approved -> Finalized). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await apiContext("spm.manage");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { docStatus?: string } | null;
  const docStatus = String(body?.docStatus ?? "");
  if (!(PENALTY_DOC_STATUSES as readonly string[]).includes(docStatus))
    return NextResponse.json({ error: "status" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase
    .from("spm_penalties")
    .update({ doc_status: docStatus, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  await supabase.rpc("log_audit", {
    p_module: "spm",
    p_action: "spm.penalty.doc_status",
    p_entity_type: "spm_penalty",
    p_entity_id: id,
    p_detail: { docStatus },
  });
  return NextResponse.json({ ok: true });
}
