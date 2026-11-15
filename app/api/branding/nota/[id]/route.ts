import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/documents?${q}`, req.url), 303);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("branding.documents.manage");
  if (!ctx) return back(req, "error=izin");
  const { id } = await params;
  const form = await req.formData();
  const action = String(form.get("_action") ?? "update");
  const supabase = await createClient();

  if (action === "delete") {
    const { error } = await supabase.from("branding_nota_dinas").delete().eq("id", id);
    if (error) return back(req, error.code === "42501" ? "error=final" : "error=gagal-hapus");
    return back(req, "ok=nota-dihapus");
  }
  if (action === "final") {
    const { error } = await supabase
      .from("branding_nota_dinas").update({ status: "FINAL", updated_by: ctx.userId }).eq("id", id);
    if (error) return back(req, "error=gagal");
    await supabase.rpc("log_audit", {
      p_module: "branding", p_action: "nota.finalize", p_entity_type: "branding_nota_dinas",
      p_entity_id: id, p_detail: {},
    });
    return back(req, "ok=nota-final");
  }
  const { data: old } = await supabase
    .from("branding_nota_dinas").select("body, payment_terms").eq("id", id).single();
  const { error } = await supabase
    .from("branding_nota_dinas")
    .update({
      status: "EDITED",
      payment_terms: { skema: String(form.get("skema") ?? "SEKALI") },
      body: {
        ...((old?.body as Record<string, unknown>) ?? {}),
        perihal: String(form.get("perihal") ?? "").trim(),
        catatan: String(form.get("catatan") ?? "").trim(),
      },
      updated_by: ctx.userId,
    })
    .eq("id", id);
  if (error) return back(req, error.code === "42501" ? "error=final" : "error=gagal");
  return back(req, "ok=nota-diubah");
}
