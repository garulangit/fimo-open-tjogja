import { newNotaDoc, toBytes, type Seg } from "@/lib/pdf";
import { formatRupiah, PLACEMENTS, durationMonths } from "@/lib/branding";
import { terbilang } from "@/lib/terbilang";
import { trayekName, ROUTE_DETAILS } from "@/lib/nota-trayek";

// Komposisi Nota Dinas versi contoh resmi (PDF owner 9 Nov 2026 — "Nota Dinas -
// contoh Nota Dinas resmi"): judul + meta, paragraf pembuka berpenekanan
// bold/italic, tabel rincian per bus dalam grup Nomor Referensi, total 3 baris,
// pembayaran dengan terbilang, tanda tangan Manajer Transportasi, dan Lampiran
// (Ketentuan + Daftar Trayek) di halaman terpisah.
export const NOTA_SIGNER_NAME = "Nama Penandatangan";
export const NOTA_SIGNER_TITLE = "Manajer Transportasi";

export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
}

export interface NotaData {
  number: string;
  created_at: string;
  body: {
    perihal?: string;
    catatan?: string;
    ref_no?: string;
    ref_date?: string;
    ref_perihal?: string;
    doc_date?: string;
  } | null;
  payment_terms: { skema?: string; deadline?: string | null; termin_deadlines?: string[] } | null;
}

export interface NotaBookingRow {
  brand_name: string;
  company_name: string | null;
  reference_no: string | null;
  placement: string;
  start_date: string;
  end_date: string;
  pricing_snapshot: { basePrice?: number; ppn?: number; totalWithPpn?: number; duration?: number } | null;
  bus_no_polisi_snapshot?: string | null;
  bus_hull_no_snapshot?: string | null;
  bus_route_snapshot?: string | null;
  bus_snapshot_at?: string | null;
  branding_buses: { no_polisi: string; hull_no: string | null; route: string | null } | null;
}

export async function buildNotaDinasPdf(nota: NotaData, rows: NotaBookingRow[]): Promise<Uint8Array> {
  const body = nota.body ?? {};
  const terms = nota.payment_terms ?? {};
  const d = await newNotaDoc();
  d.plain("Nota Dinas", { size: 12, bold: true, gapAfter: 10 });
  d.metaRow("Nomor", nota.number);
  d.metaRow("Yth", "Legal Operator A");
  d.metaRow("Dari", "Manajer Unit Transportasi");
  d.metaRow("Hal", "Permohonan Pembuatan Perjanjian");
  d.rule();
  d.gap(8);

  const docDate = fmtDateLong(body.doc_date || String(nota.created_at).slice(0, 10));

  if (!rows.length) {
    // Nota tanpa booking: isi generik dari perihal/catatan tersimpan.
    d.para([{ t: "Salam sejahtera," }], { align: "left", gapAfter: 2 });
    d.para([{ t: body.perihal || "Pengajuan administrasi branding bus." }], { firstIndent: 36 });
    if (body.catatan) d.para([{ t: `Catatan: ${body.catatan}` }]);
    d.para([{ t: "Demikian surat permohonan ini kami sampaikan, atas bantuan dan kerjasamanya kami ucapkan terimakasih." }]);
    d.rule();
    d.gap(6);
    d.plain(`Yogyakarta, ${docDate}`);
    d.gap(42);
    d.plain(NOTA_SIGNER_NAME);
    d.plain(NOTA_SIGNER_TITLE, { italic: true });
    return toBytes(d.doc);
  }

  const companies = [...new Set(rows.map((r) => r.company_name || r.brand_name).filter(Boolean))].join(", ");
  const brands = [...new Set(rows.map((r) => r.brand_name).filter(Boolean))].join(", ");
  const placements = [...new Set(rows.map((r) => PLACEMENTS[r.placement as keyof typeof PLACEMENTS] ?? r.placement))];
  const periodStart = rows.map((r) => r.start_date).sort()[0];
  const periodEnd = rows.map((r) => r.end_date).sort().at(-1)!;
  const durations = rows.map((r) => r.pricing_snapshot?.duration ?? durationMonths(r.start_date, r.end_date) ?? 0);
  const uniformDuration = durations.every((x) => x === durations[0]) ? durations[0] : null;

  const sumBase = rows.reduce((s, r) => s + (r.pricing_snapshot?.basePrice ?? 0), 0);
  const sumPpn = rows.reduce((s, r) => s + (r.pricing_snapshot?.ppn ?? 0), 0);
  const sumTotal = rows.reduce((s, r) => s + (r.pricing_snapshot?.totalWithPpn ?? 0), 0);
  const ppnPercent = sumBase > 0 ? Math.round((sumPpn / sumBase) * 100) : 11;
  const busRoute = (r: NotaBookingRow) => r.bus_snapshot_at ? r.bus_route_snapshot : r.bus_route_snapshot ?? r.branding_buses?.route;
  const busHull = (r: NotaBookingRow) => r.bus_snapshot_at ? r.bus_hull_no_snapshot : r.bus_hull_no_snapshot ?? r.branding_buses?.hull_no;
  const busPolice = (r: NotaBookingRow) => r.bus_snapshot_at ? r.bus_no_polisi_snapshot : r.bus_no_polisi_snapshot ?? r.branding_buses?.no_polisi;

  // --- Paragraf pembuka ---
  d.para([{ t: "Salam sejahtera," }], { align: "left", gapAfter: 2 });
  const intro: Seg[] = [];
  if (body.ref_no) {
    intro.push(
      { t: "Menindaklanjuti surat " },
      { t: body.ref_no, b: true },
      { t: " tanggal " },
      { t: fmtDateLong(body.ref_date), b: true },
      { t: ` perihal ${body.ref_perihal || "Persetujuan Syarat dan Kondisi"}, mohon dibuatkan surat perjanjian kerja sama pemasangan branding antara ` },
    );
  } else {
    intro.push({
      t: "Menindaklanjuti permohonan kerja sama branding bus Angkutan Perkotaan, mohon dibuatkan surat perjanjian kerja sama pemasangan branding antara ",
    });
  }
  intro.push(
    { t: "Operator A", b: true, i: true },
    { t: " dengan " },
    { t: companies, b: true, i: true },
    { t: " untuk jangka waktu Periode per " },
    { t: uniformDuration ? `${uniformDuration} Bulan` : "sesuai rincian pada tabel", b: true },
    { t: " yang dimulai " },
    { t: `dari ${fmtDateLong(periodStart)}`, b: true },
    { t: " " },
    { t: `Sampai ${fmtDateLong(periodEnd)}`, b: true },
    { t: ", iklan bus FIMO " },
    { t: placements.join(", "), b: true },
    { t: " dengan materi " },
    { t: brands, b: true },
    { t: ", dengan rincian branding sebagai berikut:" },
  );
  d.para(intro, { firstIndent: 36, gapAfter: 8 });

  // --- Tabel rincian ---
  d.table({
    size: 9.5,
    cols: [{ w: 26 }, { w: 34 }, { w: 52 }, { w: 66 }, { w: 108 }, { w: 58 }, { w: 44 }, { w: 92.28 }],
    header: [
      "No",
      "Jalur",
      "Lambung",
      "No Pol",
      "Trayek",
      "Materi",
      "Durasi",
      uniformDuration ? `Harga Satuan/${uniformDuration} Bulan` : "Harga Satuan",
    ],
    rows: rows.map((r, i) => [
      String(i + 1),
      busRoute(r) ?? "—",
      busHull(r) ?? "—",
      busPolice(r) ?? "—",
      trayekName(busRoute(r)),
      r.brand_name,
      `${durations[i]} bulan`,
      formatRupiah(r.pricing_snapshot?.basePrice),
    ]),
    footers: [
      { label: "TOTAL NILAI TANPA PPN", value: formatRupiah(sumBase) },
      { label: `PPN ${ppnPercent}%`, value: formatRupiah(sumPpn) },
      { label: "TOTAL NILAI DENGAN PPN", value: formatRupiah(sumTotal) },
    ],
  });
  d.gap(8);

  // --- Pembayaran ---
  d.para([{ t: "Dengan metode pembayaran termin dengan rincian sebagai berikut:" }], { align: "left", gapAfter: 6 });
  if (terms.skema === "TIGA_TAHAP") {
    d.para(
      [
        { t: "Pembayaran untuk Perjanjian Kerja Sama (PKS) dengan periode " },
        { t: `${fmtDateLong(periodStart)} sampai ${fmtDateLong(periodEnd)}`, b: true },
        { t: ` senilai ${formatRupiah(sumTotal)} (` },
        { t: `${terbilang(sumTotal)} Rupiah`, i: true },
        { t: ") sudah termasuk PPn dan PPh, dibayarkan dalam 3 (tiga) tahap termin dengan rincian sebagai berikut:" },
      ],
      { leftIndent: 18, hanging: 12 },
    );
    for (let i = 0; i < 3; i++) {
      const dl = terms.termin_deadlines?.[i]?.trim();
      d.para([{ t: `${i + 1}) Termin ${i + 1} — paling lambat: ${dl || "sesuai kesepakatan kedua belah pihak"}` }], {
        leftIndent: 18,
        hanging: 12,
        gapAfter: 2,
      });
    }
  } else {
    d.para(
      [
        { t: "1) Pembayaran untuk Perjanjian Kerja Sama (PKS) dengan periode " },
        { t: `${fmtDateLong(periodStart)} sampai ${fmtDateLong(periodEnd)}`, b: true },
        { t: ` dibayarkan 100% (seratus persen) senilai ${formatRupiah(sumTotal)} (` },
        { t: `${terbilang(sumTotal)} Rupiah`, i: true },
        {
          t: `) sudah termasuk PPn dan PPh, dan akan dilakukan paling lambat 7 (tujuh) hari kerja setelah tanggal awal penayangan atau pada saat penandatanganan Perjanjian oleh Kedua Belah Pihak${
            terms.deadline ? ` atau paling lambat pada tanggal ${fmtDateLong(terms.deadline)}` : ""
          }.`,
        },
      ],
      { leftIndent: 18, hanging: 12 },
    );
  }
  if (body.catatan) d.para([{ t: `Catatan: ${body.catatan}` }], { gapAfter: 6 });

  d.para(
    [{ t: "Demikian surat permohonan ini kami sampaikan, atas bantuan dan kerjasamanya kami ucapkan terimakasih." }],
    { firstIndent: 36, gapAfter: 2 },
  );
  d.rule();
  d.gap(6);
  d.plain(`Yogyakarta, ${docDate}`);
  d.gap(42);
  d.plain(NOTA_SIGNER_NAME);
  d.plain(NOTA_SIGNER_TITLE, { italic: true });

  // --- Lampiran ---
  d.newPage();
  d.plain(`Lampiran : ${nota.number}`, { gapAfter: 16 });
  d.plain("Keterangan Tambahan :", { bold: true, gapAfter: 22 });
  d.para([{ t: "A.", b: true }, { t: "Ketentuan", b: true }], { align: "left", leftIndent: 18, gapAfter: 4 });
  const placementLabel = placements[0] ?? "Full Body";
  const ketentuan: Seg[][] = [
    [
      { t: "1. Akan dilaksanakan program branding iklan bus Angkutan Perkotaan sebanyak " },
      { t: `${rows.length} (${terbilang(rows.length)})` },
      { t: ` unit bus dengan durasi sewa selama ${uniformDuration ? `${uniformDuration} Bulan` : "sesuai rincian pada tabel"}` },
    ],
    [{ t: "2. Angkutan Perkotaan " }, { t: "hanya", b: true }, { t: " menyediakan badan bus atau spacenya saja" }],
    [
      { t: `3. Harga ${placementLabel} ` },
      { t: "sudah", b: true },
      { t: ` termasuk penyewaan space iklan di Badan Bus Angkutan Perkotaan dengan Trayek dan Jalur yang sudah disepakati serta PPn sebesar ${ppnPercent}%` },
    ],
    [
      { t: `4. Harga ${placementLabel} ` },
      { t: "tidak", b: true },
      { t: " termasuk dengan biaya produksi, maintenance, biaya pemasangan sticker, bongkar pasang sticker dan perizinan" },
    ],
    [{ t: "5. Sticker dibuat untuk tidak menutupi bagian lampu dari rem bus" }],
    [{ t: "6. Tulisan Angkutan Perkotaan Istimewa di bagian body bus tidak boleh tertutupi oleh sticker" }],
    [
      {
        t: "7. PT. Operator A secara kooperatif siap memberikan segala update informasi terkait dengan hal yang menyangkut tentang branding bus tersebut",
      },
    ],
    [
      {
        t: "8. Diharuskan untuk berhati – hati terhadap pemasangan dan pencopotan sticker agar warna bus kembali seperti semula",
      },
    ],
  ];
  for (const k of ketentuan) d.para(k, { leftIndent: 35, hanging: 15, gapAfter: 2 });
  d.gap(16);
  d.para([{ t: "B.", b: true }, { t: "Daftar Trayek", b: true }], { align: "left", leftIndent: 18, gapAfter: 10 });
  const jalurUnik = [...new Set(rows.map((r) => r.branding_buses?.route).filter(Boolean))] as string[];
  jalurUnik.forEach((jalur, i) => {
    const detail = ROUTE_DETAILS[jalur.toUpperCase()] ?? trayekName(jalur);
    d.para([{ t: `${i + 1}. Rute Yang Dilewati Jalur ${jalur} ` }, { t: detail }], {
      leftIndent: 35,
      hanging: 15,
      gapAfter: 4,
    });
  });

  return toBytes(d.doc);
}
