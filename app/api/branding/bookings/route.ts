import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { newBookingReference, snapshotForBooking } from "@/lib/branding-server";
import { PLACEMENTS } from "@/lib/branding";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/bookings?${q}`, req.url), 303);

/**
 * Buat satu transaksi company + brand + periode dengan banyak booking bus.
 * Tiap anggota memiliki penempatan sendiri; grup/ref ditetapkan oleh database
 * berdasarkan tiga atribut induk, termasuk saat dua permintaan masuk bersamaan.
 * Konflik armada tetap diperiksa untuk semua bus sebelum insert.
 */
export async function POST(req: NextRequest) {
  const ctx = await apiContext("branding.booking.manage");
  if (!ctx) return back(req, "error=izin");
  const form = await req.formData();
  const busIds = [...new Set(form.getAll("bus_ids").map((v) => String(v)).filter(Boolean))];
  if (busIds.length === 0) {
    const single = String(form.get("bus_id") ?? "");
    if (single) busIds.push(single);
  }
  const placementByBus = new Map<string, string>();
  for (const raw of form.getAll("bus_placements")) {
    const [busId, placement] = String(raw).split(":");
    if (busId && placement) placementByBus.set(busId, placement);
  }
  const legacyPlacement = String(form.get("placement") ?? "");
  const startDate = String(form.get("start_date") ?? "");
  const endDate = String(form.get("end_date") ?? "");
  const brandName = String(form.get("brand_name") ?? "").trim();
  if (busIds.length === 0 || !startDate || !endDate || !brandName)
    return back(req, "error=wajib");

  const supabase = await createClient();
  const { data: buses } = await supabase
    .from("branding_buses")
    .select("id, no_polisi, bus_type")
    .in("id", busIds);
  if (!buses || buses.length !== busIds.length) return back(req, "error=bus");

  // Pra-cek konflik untuk semua bus sekaligus.
  const { data: conflicts } = await supabase
    .from("branding_bookings")
    .select("bus_id, branding_buses(no_polisi)")
    .in("bus_id", busIds)
    .neq("status", "SELESAI")
    .lte("start_date", endDate)
    .gte("end_date", startDate);
  if (conflicts && conflicts.length > 0) {
    const plates = [
      ...new Set(
        conflicts.map(
          (c) => (c.branding_buses as unknown as { no_polisi: string } | null)?.no_polisi ?? "",
        ),
      ),
    ].filter(Boolean);
    return back(
      req,
      "error=konflik&msg=" +
        encodeURIComponent(
          `Bus sudah memiliki booking aktif pada periode tersebut: ${plates.join(", ")}. Pengajuan dibatalkan seluruhnya.`,
        ),
    );
  }

  const companyName = String(form.get("company_name") ?? "").trim() || null;
  const referenceNo = await newBookingReference(supabase);
  const rows = [];
  let unpriced = 0;
  let firstPriceError = "";
  for (const bus of buses) {
    const placement = placementByBus.get(bus.id) ?? legacyPlacement;
    if (!Object.keys(PLACEMENTS).includes(placement)) return back(req, "error=wajib");
    const snap = await snapshotForBooking(supabase, bus.bus_type, placement, startDate, endDate);
    if (!snap.priced) {
      unpriced++;
      if (!firstPriceError) firstPriceError = snap.error ?? "";
    }
    rows.push({
      bus_id: bus.id,
      reference_no: referenceNo,
      brand_name: brandName,
      company_name: companyName,
      placement,
      booking_date: String(form.get("booking_date") ?? "") || null,
      start_date: startDate,
      end_date: endDate,
      status: String(form.get("status") ?? "BOOKING"),
      notes: String(form.get("notes") ?? "").trim() || null,
      pricing_snapshot: snap.snapshot ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
  }

  const { data: inserted, error } = await supabase
    .from("branding_bookings")
    .insert(rows)
    .select("id, bus_id, reference_no");
  if (error) {
    if (error.code === "23505")
      return back(req, "error=konflik&msg=" + encodeURIComponent(error.message));
    return back(req, "error=gagal&msg=" + encodeURIComponent(error.message));
  }
  const actualReferenceNo = inserted?.[0]?.reference_no ?? referenceNo;
  for (const row of inserted ?? []) {
    await supabase.rpc("log_audit", {
      p_module: "branding", p_action: "booking.create", p_entity_type: "branding_booking",
      p_entity_id: row.id,
      p_detail: {
        brand: brandName, placement: placementByBus.get(row.bus_id) ?? legacyPlacement,
        start: startDate, end: endDate,
        reference_no: actualReferenceNo, group_size: rows.length,
      },
    });
  }
  const msg = `Nomor Referensi ${actualReferenceNo} — ${rows.length} bus`;
  if (unpriced > 0)
    return back(req, "ok=booking-tanpa-harga&msg=" + encodeURIComponent(msg) + "&warn=" + encodeURIComponent(firstPriceError));
  return back(req, "ok=booking-dibuat&msg=" + encodeURIComponent(msg));
}
