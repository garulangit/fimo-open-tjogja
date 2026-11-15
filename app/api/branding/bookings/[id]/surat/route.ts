import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { newLetter, signature, toBytes } from "@/lib/pdf";
import { formatRupiah, PLACEMENTS } from "@/lib/branding";
import { getActivePricing } from "@/lib/branding-server";
import { groupKeyOf, loadActiveAdjustments, scaleSnapshot } from "@/lib/branding-adjust";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("branding.documents.view");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("jenis") === "konfirmasi" ? "konfirmasi" : "penawaran";
  const supabase = await createClient();
  const { data: bk } = await supabase
    .from("branding_bookings")
    .select("*, branding_buses(no_polisi, hull_no, bus_type, route)")
    .eq("id", id)
    .single();
  if (!bk) return NextResponse.json({ error: "not found" }, { status: 404 });
  const bus = bk.branding_buses as unknown as { no_polisi: string; hull_no: string | null; bus_type: string | null; route: string | null } | null;
  const hasBusSnapshot = Boolean(bk.bus_snapshot_at);
  const busNo = hasBusSnapshot ? bk.bus_no_polisi_snapshot ?? "-" : bk.bus_no_polisi_snapshot ?? bus?.no_polisi ?? "-";
  const busHull = hasBusSnapshot ? bk.bus_hull_no_snapshot : bk.bus_hull_no_snapshot ?? bus?.hull_no ?? null;
  const busRoute = hasBusSnapshot ? bk.bus_route_snapshot ?? "" : bk.bus_route_snapshot ?? bus?.route ?? "";
  const busType = hasBusSnapshot ? bk.bus_type_snapshot : bk.bus_type_snapshot ?? bus?.bus_type ?? null;
  const rawSnap = bk.pricing_snapshot as { basePrice?: number; ppn?: number; totalWithPpn?: number; duration?: number; monthlyRevenue?: number } | null;
  // Nilai surat mengikuti total efektif (nego, kunci rasio) bila ada.
  const adjRatio = (await loadActiveAdjustments(supabase)).get(groupKeyOf(bk as never))?.ratio ?? 1;
  const snap = scaleSnapshot(rawSnap, adjRatio);
  const placementLabel = PLACEMENTS[bk.placement as keyof typeof PLACEMENTS] ?? bk.placement;

  const b = await newLetter();
  if (kind === "penawaran") {
    b.line("SURAT PENAWARAN", { size: 15, bold: true });
    if (bk.reference_no) b.line(`Nomor Referensi: ${bk.reference_no}`, { size: 11 });
    b.space(4);
    b.line(`Kepada Yth.: ${bk.company_name || bk.brand_name}`, { size: 11 });
    b.line(`Perihal: Penawaran pemasangan branding bus Angkutan Perkotaan`, { size: 11 });
    b.space(8);
    b.line(`Bersama ini kami tawarkan pemasangan branding ${placementLabel} pada bus ${busNo}${busHull ? ` (lambung ${busHull})` : ""}, ${busRoute}, untuk brand ${bk.brand_name}, periode ${bk.start_date} s.d. ${bk.end_date} (${snap?.duration ?? "-"} bulan).`, { size: 11 });
    b.space(6);
    const pricing = await getActivePricing(supabase);
    if (pricing && busType && snap) {
      b.line("Tarif sesuai pricelist yang berlaku (sebelum PPN):", { size: 11, bold: true });
      for (const e of pricing.entries.filter((x) => x.mediaBus.trim().toLowerCase() === busType.trim().toLowerCase())) {
        const tiers = [1, 3, 6, 12]
          .filter((d) => e.durations[d] !== undefined || e.durations[String(d)] !== undefined)
          .map((d) => `${d} bln: ${formatRupiah(e.durations[d] ?? e.durations[String(d)])}`)
          .join(" | ");
        if (tiers) b.line(`${e.spaceIklan}: ${tiers}`, { size: 10 });
      }
      b.space(6);
    }
    if (snap) {
      b.line(`Harga penawaran periode ini: ${formatRupiah(snap.basePrice)}`, { size: 11 });
      b.line(`PPN: ${formatRupiah(snap.ppn)}`, { size: 11 });
      b.line(`Total: ${formatRupiah(snap.totalWithPpn)}`, { size: 11, bold: true });
    }
    b.space(6);
    b.line("Penawaran ini mengikuti ketentuan dan ketersediaan armada pada saat konfirmasi tertulis diterima.", { size: 11 });
    signature(b, "Unit Transportasi Angkutan Perkotaan");
  } else {
    b.line("SURAT KONFIRMASI", { size: 15, bold: true });
    if (bk.reference_no) b.line(`Nomor Referensi: ${bk.reference_no}`, { size: 11 });
    b.space(4);
    b.line(`Kepada Yth.: ${bk.company_name || bk.brand_name}`, { size: 11 });
    b.line("Perihal: Konfirmasi penempatan branding bus", { size: 11 });
    b.space(8);
    b.line(`Kami konfirmasikan penempatan branding ${placementLabel} untuk brand ${bk.brand_name} pada bus ${busNo}${busHull ? ` (lambung ${busHull})` : ""}, berlaku ${bk.start_date} s.d. ${bk.end_date}, dengan status ${bk.status}.`, { size: 11 });
    if (snap) {
      b.space(4);
      b.line(`Nilai kontrak: ${formatRupiah(snap.totalWithPpn)} (termasuk PPN ${formatRupiah(snap.ppn)}).`, { size: 11 });
    }
    b.space(6);
    b.line("Mohon kelengkapan administrasi (PKS, invoice, bukti transfer, kwitansi, faktur pajak) dilengkapi sesuai ketentuan.", { size: 11 });
    signature(b, "Unit Transportasi Angkutan Perkotaan");
  }
  const bytes = await toBytes(b.doc);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="surat-${kind}-${bk.brand_name.replace(/\s+/g, "_")}.pdf"`,
    },
  });
}
