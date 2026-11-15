import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/documents?${q}`, req.url), 303);

async function nextNotaNumber(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const mm = get("month");
  const dd = get("day");
  const yyyy = get("year");
  const monthStart = `${yyyy}-${mm}-01T00:00:00+07:00`;
  const { count } = await supabase
    .from("branding_nota_dinas")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monthStart);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${mm}.${dd}.${seq}/OPR/U.1/NDN/${yyyy}`;
}

export async function POST(req: NextRequest) {
  const ctx = await apiContext("branding.documents.manage");
  if (!ctx) return back(req, "error=izin");
  const form = await req.formData();
  const supabase = await createClient();
  const skema = String(form.get("skema") ?? "SEKALI");
  const number = await nextNotaNumber(supabase);
  const bookingId = String(form.get("booking_id") ?? "") || null;

  // Perihal kosong + booking dipilih (berdasarkan Nomor Referensi di picker):
  // isi otomatis dari data booking terkait (revisi 1.0.1 C.5/C.6).
  let perihal = String(form.get("perihal") ?? "").trim();
  if (!perihal && bookingId) {
    const { data: bk } = await supabase
      .from("branding_bookings")
      .select("brand_name, company_name, reference_no, start_date, end_date")
      .eq("id", bookingId)
      .single();
    if (bk) {
      perihal =
        `Pengajuan administrasi branding ${bk.brand_name}` +
        `${bk.company_name ? ` (${bk.company_name})` : ""}` +
        ` periode ${bk.start_date} s.d. ${bk.end_date}` +
        `${bk.reference_no ? ` — ${bk.reference_no}` : ""}`;
    }
  }

  // Field pendukung Nota Dinas versi contoh resmi (PDF owner 9 Nov 2026):
  // surat referensi klien, tanggal dokumen, dan batas pembayaran — disimpan di
  // jsonb body/payment_terms yang sudah ada (tanpa migration baru).
  const terminDeadlines = ["termin_1", "termin_2", "termin_3"]
    .map((k) => String(form.get(k) ?? "").trim())
    .filter(Boolean);
  const { data, error } = await supabase
    .from("branding_nota_dinas")
    .insert({
      booking_id: bookingId,
      number,
      payment_terms: {
        skema,
        deadline: String(form.get("pay_deadline") ?? "").trim() || null,
        termin_deadlines: terminDeadlines,
      },
      body: {
        perihal,
        catatan: String(form.get("catatan") ?? "").trim(),
        ref_no: String(form.get("ref_no") ?? "").trim(),
        ref_date: String(form.get("ref_date") ?? "").trim(),
        ref_perihal: String(form.get("ref_perihal") ?? "").trim(),
        doc_date: String(form.get("doc_date") ?? "").trim(),
      },
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return back(req, "error=gagal&msg=" + encodeURIComponent(error.message));
  await supabase.rpc("log_audit", {
    p_module: "branding", p_action: "nota.create", p_entity_type: "branding_nota_dinas",
    p_entity_id: data.id, p_detail: { number },
  });
  return back(req, "ok=nota-dibuat");
}
