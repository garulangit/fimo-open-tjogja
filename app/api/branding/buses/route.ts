import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/buses?${q}`, req.url), 303);

export async function POST(req: NextRequest) {
  const ctx = await apiContext("branding.bus.manage");
  if (!ctx) return back(req, "error=izin");
  const form = await req.formData();
  const noPolisi = String(form.get("no_polisi") ?? "").trim().toUpperCase();
  if (!noPolisi) return back(req, "error=wajib");
  const supabase = await createClient();
  const { error } = await supabase.from("branding_buses").insert({
    no_polisi: noPolisi,
    fleet_no: String(form.get("fleet_no") ?? "").trim() || null,
    hull_no: String(form.get("hull_no") ?? "").trim() || null,
    bus_type: String(form.get("bus_type") ?? "").trim() || null,
    route: String(form.get("route") ?? "").trim() || null,
    color: String(form.get("color") ?? "").trim() || null,
    body_maker: String(form.get("body_maker") ?? "").trim() || null,
    created_by: ctx.userId,
  });
  if (error) return back(req, error.code === "23505" ? "error=duplikat" : "error=gagal");
  await supabase.rpc("log_audit", {
    p_module: "branding", p_action: "bus.create", p_entity_type: "branding_bus",
    p_entity_id: null, p_detail: { no_polisi: noPolisi },
  });
  return back(req, "ok=bus-dibuat");
}
