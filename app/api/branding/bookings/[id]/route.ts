import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus } from "@/lib/branding";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/bookings?${q}`, req.url), 303);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("branding.booking.manage");
  if (!ctx) return back(req, "error=izin");
  const { id } = await params;
  const form = await req.formData();
  const action = String(form.get("_action") ?? "update");
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("branding_bookings").select("status, end_date").eq("id", id).maybeSingle();
  if (existing && effectiveStatus(existing.status, existing.end_date) === "SELESAI")
    return back(req, "error=history-hanya-lihat");

  if (action === "delete") {
    if (!ctx.permissions.includes("branding.booking.delete")) return back(req, "error=izin");
    const { error } = await supabase.from("branding_bookings").delete().eq("id", id);
    if (error) return back(req, "error=gagal-hapus");
    await supabase.rpc("log_audit", {
      p_module: "branding", p_action: "booking.delete", p_entity_type: "branding_booking",
      p_entity_id: id, p_detail: {},
    });
    return back(req, "ok=booking-dihapus");
  }

  if (action === "status") {
    const status = String(form.get("status") ?? "");
    const { error } = await supabase
      .from("branding_bookings").update({ status, updated_by: ctx.userId }).eq("id", id);
    if (error) {
      if (error.code === "23505")
        return back(req, "error=konflik&msg=" + encodeURIComponent(error.message));
      return back(req, "error=gagal");
    }
    await supabase.rpc("log_audit", {
      p_module: "branding", p_action: "booking.status", p_entity_type: "branding_booking",
      p_entity_id: id, p_detail: { status },
    });
    return back(req, "ok=status-diubah");
  }

  // update penuh: snapshot dihitung ulang dari konfigurasi harga aktif
  const busId = String(form.get("bus_id") ?? "");
  const placement = String(form.get("placement") ?? "");
  const startDate = String(form.get("start_date") ?? "");
  const endDate = String(form.get("end_date") ?? "");
  const { data: bus } = await supabase
    .from("branding_buses").select("id").eq("id", busId).single();
  if (!bus) return back(req, "error=bus");
  const { error } = await supabase
    .from("branding_bookings")
    .update({
      bus_id: busId,
      brand_name: String(form.get("brand_name") ?? "").trim(),
      company_name: String(form.get("company_name") ?? "").trim() || null,
      placement,
      booking_date: String(form.get("booking_date") ?? "") || null,
      start_date: startDate,
      end_date: endDate,
      status: String(form.get("status") ?? "BOOKING"),
      notes: String(form.get("notes") ?? "").trim() || null,
      updated_by: ctx.userId,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505")
      return back(req, "error=konflik&msg=" + encodeURIComponent(error.message));
    return back(req, "error=gagal&msg=" + encodeURIComponent(error.message));
  }
  await supabase.rpc("log_audit", {
    p_module: "branding", p_action: "booking.update", p_entity_type: "branding_booking",
    p_entity_id: id, p_detail: { pricing_snapshot: "preserved" },
  });
  return back(req, "ok=booking-diubah");
}
