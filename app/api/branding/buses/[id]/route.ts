import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/buses?${q}`, req.url), 303);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("branding.bus.manage");
  if (!ctx) return back(req, "error=izin");
  const { id } = await params;
  const form = await req.formData();
  const action = String(form.get("_action") ?? "update");
  const supabase = await createClient();
  if (action === "delete") {
    const { error } = await supabase.from("branding_buses").delete().eq("id", id);
    if (error) return back(req, "error=gagal-hapus");
    await supabase.rpc("log_audit", {
      p_module: "branding", p_action: "bus.delete", p_entity_type: "branding_bus",
      p_entity_id: id, p_detail: {},
    });
    return back(req, "ok=bus-dihapus");
  }
  const { error } = await supabase
    .from("branding_buses")
    .update({
      fleet_no: String(form.get("fleet_no") ?? "").trim() || null,
      hull_no: String(form.get("hull_no") ?? "").trim() || null,
      bus_type: String(form.get("bus_type") ?? "").trim() || null,
      route: String(form.get("route") ?? "").trim() || null,
      color: String(form.get("color") ?? "").trim() || null,
      body_maker: String(form.get("body_maker") ?? "").trim() || null,
    })
    .eq("id", id);
  if (error) return back(req, "error=gagal");
  return back(req, "ok=bus-diubah");
}
