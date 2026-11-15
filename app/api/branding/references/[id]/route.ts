import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BOOKING_STATUSES, effectiveStatus } from "@/lib/branding";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("branding.booking.manage");
  if (!ctx) return NextResponse.redirect(new URL("/branding/bookings?error=izin", req.url), 303);
  const { id } = await params;
  const form = await req.formData();
  const status = String(form.get("status") ?? "");
  const back = (query: string) => NextResponse.redirect(new URL(`/branding/bookings?${query}`, req.url), 303);
  if (!BOOKING_STATUSES.includes(status as (typeof BOOKING_STATUSES)[number])) return back("error=status-tidak-valid");

  const supabase = await createClient();
  const { data: members, error: readError } = await supabase
    .from("branding_bookings").select("id, status, end_date").eq("transaction_id", id);
  if (readError || !members?.length) return back("error=referensi-tidak-ditemukan");
  if (members.some((row) => effectiveStatus(row.status, row.end_date) === "SELESAI"))
    return back("error=history-hanya-lihat");

  const { error } = await supabase.from("branding_bookings")
    .update({ status, updated_by: ctx.userId }).eq("transaction_id", id);
  if (error) return back(error.code === "23505" ? "error=konflik" : "error=gagal");

  await supabase.rpc("log_audit", {
    p_module: "branding", p_action: "booking.reference_status", p_entity_type: "branding_transaction",
    p_entity_id: id, p_detail: { status, member_count: members.length },
  });
  return back("ok=status-referensi-diubah");
}
