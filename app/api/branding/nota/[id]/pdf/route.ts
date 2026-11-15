import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildNotaDinasPdf, type NotaBookingRow } from "@/lib/nota-pdf";

// Nota Dinas versi contoh resmi — komposisi PDF ada di lib/nota-pdf.ts.
// Baris rincian = seluruh booking dalam grup Nomor Referensi yang sama.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("branding.documents.view");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: nota } = await supabase.from("branding_nota_dinas").select("*").eq("id", id).single();
  if (!nota) return NextResponse.json({ error: "not found" }, { status: 404 });

  let rows: NotaBookingRow[] = [];
  if (nota.booking_id) {
    const cols =
      "brand_name, company_name, reference_no, placement, start_date, end_date, pricing_snapshot, bus_no_polisi_snapshot, bus_hull_no_snapshot, bus_route_snapshot, bus_snapshot_at, branding_buses(no_polisi, hull_no, route)";
    const { data: first } = await supabase.from("branding_bookings").select(cols).eq("id", nota.booking_id).single();
    if (first) {
      const fb = first as unknown as NotaBookingRow;
      if (fb.reference_no) {
        const { data: group } = await supabase
          .from("branding_bookings")
          .select(cols)
          .eq("reference_no", fb.reference_no)
          .order("start_date", { ascending: true });
        rows = (group as unknown as NotaBookingRow[]) ?? [fb];
      } else rows = [fb];
    }
  }

  const bytes = await buildNotaDinasPdf(
    { number: nota.number, created_at: nota.created_at, body: nota.body, payment_terms: nota.payment_terms },
    rows,
  );
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="nota-dinas-${nota.number.replaceAll("/", "_")}.pdf"`,
    },
  });
}
