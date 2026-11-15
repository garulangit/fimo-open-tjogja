import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActivePricing } from "@/lib/branding-server";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/pricing?${q}`, req.url), 303);

export async function POST(req: NextRequest) {
  const ctx = await apiContext("branding.pricing.manage");
  if (!ctx) return back(req, "error=izin");
  const form = await req.formData();
  let entries: unknown;
  try {
    entries = JSON.parse(String(form.get("entries") ?? "[]"));
    if (!Array.isArray(entries)) throw new Error("bukan array");
  } catch {
    return back(req, "error=json");
  }
  const supabase = await createClient();
  const current = await getActivePricing(supabase);
  const version = (current?.version ?? 0) + 1;
  const { error } = await supabase.from("branding_pricing_config").insert({
    version,
    price_matrix: { entries },
    ppn_enabled: form.get("ppn_enabled") === "on",
    ppn_percent: Number(form.get("ppn_percent") ?? 11),
    created_by: ctx.userId,
  });
  if (error) return back(req, "error=gagal");
  await supabase.rpc("log_audit", {
    p_module: "branding", p_action: "pricing.publish", p_entity_type: "branding_pricing_config",
    p_entity_id: null, p_detail: { version },
  });
  return back(req, "ok=pricing-v" + version);
}
