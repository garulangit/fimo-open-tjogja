import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/branding";
import { MONTH_NAMES } from "@/lib/claim";
import { loadClaimBundle } from "@/lib/claim-server";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actx = await apiContext("claim.claim.view");
  if (!actx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const supabase = await createClient();
  const bundle = await loadClaimBundle(supabase, id);
  if (!bundle) return NextResponse.json({ error: "Klaim tidak ditemukan." }, { status: 404 });
  const c = bundle.claim as unknown as Record<string, unknown> & {
    claim_number: string; operator_name: string; period_month: number; period_year: number;
    pic_name: string; pic_position: string; profit_percentage: number; current_version: number;
    vehicle_type_id: string; regulation_version_id: string;
  };

  const { data: tpl } = await supabase
    .from("claim_letter_templates").select("*").eq("active", true)
    .order("is_default", { ascending: false }).limit(1).maybeSingle();
  const { data: vehicle } = await supabase
    .from("claim_vehicle_types").select("name").eq("id", c.vehicle_type_id).single();
  const { data: regulation } = await supabase
    .from("claim_regulation_versions").select("title, legal_basis").eq("id", c.regulation_version_id).single();

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  const INK = rgb(0.09, 0.11, 0.09);
  let y = 841.89 - 56;
  const line = (text: string, size = 11, isBold = false, gap = 2) => {
    page.drawText(text, { x: 56, y, size, font: isBold ? bold : regular, color: INK });
    y -= size + 5 + gap;
  };
  const tz = new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  });
  const today = tz.format(new Date());

  line(tpl?.header_title ?? "DINAS PERHUBUNGAN DAERAH ISTIMEWA YOGYAKARTA", 13, true, 0);
  line(tpl?.header_subtitle ?? "PENGAJUAN SUBSIDI OPERASIONAL ANGKUTAN PERKOTAAN TRANS JOGJA", 10, true, 4);
  page.drawLine({ start: { x: 56, y: y + 8 }, end: { x: 595.28 - 56, y: y + 8 }, thickness: 1.6, color: rgb(0.09, 0.45, 0.27) });
  y -= 12;
  line("SURAT PENGAJUAN KLAIM SUBSIDI OPERASIONAL", 12, true, 6);
  line(`Nomor Klaim : ${c.claim_number} (Versi ${c.current_version})`);
  line(`Operator : ${c.operator_name}`);
  line(`Periode : ${MONTH_NAMES[c.period_month - 1]} ${c.period_year}`);
  line(`Jenis Kendaraan : ${vehicle?.name ?? "-"}`);
  line(`Dasar Regulasi : ${regulation?.title ?? "-"}${regulation?.legal_basis ? ` (${regulation.legal_basis})` : ""}`);
  line(`Penanggung Jawab : ${c.pic_name} - ${c.pic_position}`);
  line(`Tanggal Surat : ${today}`, 11, false, 10);
  line("RINCIAN PERHITUNGAN", 11, true, 4);
  const num = (k: string) => Number((bundle.claim as Record<string, unknown>)[k] ?? 0);
  const rows: Array<[string, number]> = [
    ["Total Biaya Langsung", num("total_direct_cost")],
    ["Total Biaya Tidak Langsung", num("total_indirect_cost")],
    ["Total Biaya Dasar", num("total_base_cost")],
    [`Keuntungan (${c.profit_percentage}%)`, num("total_profit")],
    ["Total Biaya Pendukung", num("total_supporting_cost")],
    ["TOTAL BIAYA OPERASIONAL", num("total_operational_cost")],
    ["Total Pendapatan (Tiket + Branding)", num("total_revenue")],
  ];
  for (const [label, value] of rows) line(`${label} : ${formatRupiah(value)}`);
  y -= 4;
  line(`SUBSIDI YANG DIAJUKAN : ${formatRupiah(num("calculated_subsidy"))}`, 12, true, 8);
  if (tpl?.body_template) line(String(tpl.body_template), 10);
  y -= 18;
  line(`Yogyakarta, ${today}`);
  line(tpl?.signatory_title ?? "Direktur Utama");
  y -= 44;
  line(tpl?.signatory_name ?? "( ____________________ )", 11, true);

  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="surat-${c.claim_number}.pdf"`,
    },
  });
}
