import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActivePricing } from "@/lib/branding-server";
import { loadActiveAdjustments, scaleSnapshot } from "@/lib/branding-adjust";

type BookingMember = {
  id: string;
  reference_no: string | null;
  company_name: string | null;
  brand_name: string;
  placement: string;
  start_date: string;
  end_date: string;
  booking_date: string | null;
  status: string;
  pricing_snapshot: { mediaBus?: string; basePrice?: number; ppn?: number; totalWithPpn?: number; duration?: number } | null;
  bus_no_polisi_snapshot: string | null;
  bus_fleet_no_snapshot: string | null;
  bus_hull_no_snapshot: string | null;
  bus_route_snapshot: string | null;
  bus_type_snapshot: string | null;
  bus_snapshot_at: string | null;
  branding_buses: { no_polisi: string; fleet_no: string | null; hull_no: string | null; route: string | null; bus_type: string | null } | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("branding.documents.view");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("jenis") === "konfirmasi" ? "konfirmasi" : "penawaran";
  const supabase = await createClient();
  const { data, error } = await supabase.from("branding_bookings")
    .select("*, branding_buses(no_polisi, fleet_no, hull_no, bus_type, route)")
    .eq("transaction_id", id).order("bus_no_polisi_snapshot", { ascending: true });
  const members = (data ?? []) as unknown as BookingMember[];
  if (error || !members.length) return NextResponse.json({ error: "reference not found" }, { status: 404 });

  const pricing = kind === "penawaran" ? await getActivePricing(supabase) : null;
  // Nilai surat mengikuti total efektif (nego, kunci rasio) bila ada.
  const adjRatio = (await loadActiveAdjustments(supabase)).get(id)?.ratio ?? 1;
  const bookingDate = members[0].booking_date;
  const letterDate = bookingDate && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate)
    ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric" })
      .format(new Date(`${bookingDate}T00:00:00+07:00`))
    : new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  const response = NextResponse.json({
    kind,
    reference: members[0].reference_no,
    company: members[0].company_name || members[0].brand_name,
    brand: members[0].brand_name,
    letterDate,
    members: members.map((member) => {
      const bus = member.branding_buses;
      const snapshot = Boolean(member.bus_snapshot_at);
      return {
        noPolisi: snapshot ? member.bus_no_polisi_snapshot : member.bus_no_polisi_snapshot ?? bus?.no_polisi,
        fleetNo: snapshot ? member.bus_fleet_no_snapshot : member.bus_fleet_no_snapshot ?? bus?.fleet_no,
        hullNo: snapshot ? member.bus_hull_no_snapshot : member.bus_hull_no_snapshot ?? bus?.hull_no,
        route: snapshot ? member.bus_route_snapshot : member.bus_route_snapshot ?? bus?.route,
        busType: snapshot ? member.bus_type_snapshot : member.bus_type_snapshot ?? bus?.bus_type,
        placement: member.placement,
        startDate: member.start_date,
        endDate: member.end_date,
        duration: member.pricing_snapshot?.duration ?? 0,
        pricing: scaleSnapshot(member.pricing_snapshot, adjRatio),
      };
    }),
    pricing,
  });
  response.headers.set("cache-control", "private, no-store");
  return response;
}
