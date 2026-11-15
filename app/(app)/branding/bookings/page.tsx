import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BOOKING_STATUSES, effectiveStatus } from "@/lib/branding";
import BusPicker from "@/components/BusPicker";
import BrandingTransactionTable, { type BrandingBusOption, type BrandingTransactionRow } from "@/components/dashboard/BrandingTransactionTable";
import { applyAdjustments, loadActiveAdjustments } from "@/lib/branding-adjust";

const OK: Record<string, string> = {
  "booking-dibuat": "Booking dibuat.",
  "booking-tanpa-harga": "Booking dibuat, tetapi harga tidak dapat dihitung (snapshot kosong).",
  "booking-diubah": "Booking diperbarui.",
  "booking-dihapus": "Booking dihapus.",
  "status-diubah": "Status booking diubah.",
  "status-referensi-diubah": "Status seluruh bus pada referensi berhasil diperbarui.",
};
const ERR: Record<string, string> = {
  izin: "Anda tidak memiliki izin untuk aksi ini.",
  wajib: "Field wajib belum lengkap.",
  bus: "Bus tidak ditemukan.",
  konflik: "Konflik: bus sudah memiliki booking aktif pada rentang tanggal tersebut.",
  gagal: "Operasi gagal.",
  "gagal-hapus": "Gagal menghapus (mungkin masih dirujuk data lain).",
  "history-hanya-lihat": "Transaksi selesai di History hanya dapat dilihat dan tidak bisa diubah.",
  "referensi-tidak-ditemukan": "Nomor referensi tidak ditemukan.",
  "status-tidak-valid": "Status yang dipilih tidak valid.",
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; msg?: string; warn?: string; status?: string; q?: string; lambung?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getSessionContext();
  const canManage = ctx?.permissions.includes("branding.booking.manage") ?? false;
  const supabase = await createClient();
  const [{ data: buses }, { data: bookings }] = await Promise.all([
    supabase.from("branding_buses").select("id, no_polisi, hull_no, bus_type, route").order("no_polisi"),
    supabase
      .from("branding_bookings")
      .select("*, branding_buses(id, no_polisi, fleet_no, hull_no, route, bus_type)")
      .order("start_date", { ascending: false }),
  ]);
  let rows = (bookings ?? []) as unknown as BrandingTransactionRow[];
  // Nilai efektif nego (kunci rasio): snapshot diskalakan sebelum tampil/agregat.
  const adjMap = await loadActiveAdjustments(supabase);
  rows = applyAdjustments(rows, adjMap);
  const groupKey = (row: BrandingTransactionRow) => row.transaction_id || row.reference_no || row.id;
  const matchingGroups = new Set(rows
    .filter((row) => sp.status
      ? effectiveStatus(row.status, row.end_date) === sp.status
      : sp.q?.trim() || sp.lambung?.trim()
        ? true // pencarian aktif: riwayat SELESAI ikut dicari
        : effectiveStatus(row.status, row.end_date) !== "SELESAI")
    .map(groupKey));
  rows = rows.filter((row) => matchingGroups.has(groupKey(row)));
  if (sp.q?.trim()) {
    const needle = sp.q.trim().toLowerCase();
    const qGroups = new Set(
      rows
        .filter((row) => {
          const bus = (row as unknown as { branding_buses?: { no_polisi?: string; fleet_no?: string; hull_no?: string; route?: string } | null }).branding_buses;
          const hay = [row.brand_name, row.company_name, bus?.no_polisi, bus?.fleet_no, bus?.hull_no, bus?.route]
            .filter(Boolean).join(" ").toLowerCase();
          return hay.includes(needle);
        })
        .map(groupKey),
    );
    rows = rows.filter((row) => qGroups.has(groupKey(row)));
  }
  if (sp.lambung?.trim()) {
    const needle = sp.lambung.trim().toLowerCase();
    const lGroups = new Set(
      rows
        .filter((row) => {
          const bus = (row as unknown as { branding_buses?: { fleet_no?: string } | null }).branding_buses;
          return (bus?.fleet_no ?? "").toLowerCase().includes(needle);
        })
        .map(groupKey),
    );
    rows = rows.filter((row) => lGroups.has(groupKey(row)));
  }

  return (
    <>
      {sp.ok && <div className="alert ok">{OK[sp.ok] ?? "Berhasil."}{sp.msg ? ` ${sp.msg}` : ""}{sp.warn ? ` Peringatan harga: ${sp.warn}` : ""}</div>}
      {sp.error && (
        <div className="alert error">
          {ERR[sp.error] ?? sp.error}
          {sp.msg ? <div className="small-text">{sp.msg}</div> : null}
        </div>
      )}

      {canManage && (
        <div className="card anim-pop" style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            <CalendarPlus size={18} /> Transaksi branding baru
          </h3>
          <form method="post" action="/api/branding/bookings">
            <div style={{ marginBottom: 12 }}>
              <label>Pilih bus dan atur penempatan setiap bus (Nomor Referensi mengikuti company, brand, dan periode)</label>
              <BusPicker buses={buses ?? []} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
              <div>
                <label htmlFor="brand_name">Nama brand</label>
                <input id="brand_name" name="brand_name" required />
              </div>
              <div>
                <label htmlFor="company_name">Nama PT</label>
                <input id="company_name" name="company_name" />
              </div>
              <div>
                <label htmlFor="booking_date">Tanggal booking</label>
                <input id="booking_date" name="booking_date" type="date" />
              </div>
              <div>
                <label htmlFor="start_date">Tanggal mulai</label>
                <input id="start_date" name="start_date" type="date" required />
              </div>
              <div>
                <label htmlFor="end_date">Tanggal selesai</label>
                <input id="end_date" name="end_date" type="date" required />
              </div>
              <div>
                <label htmlFor="status">Status</label>
                <select id="status" name="status">
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="notes">Keterangan</label>
                <input id="notes" name="notes" />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn primary" type="submit">Simpan transaksi</button>
              <span className="muted small-text" style={{ marginLeft: 10 }}>
                Harga snapshot dihitung otomatis per bus dari pricelist aktif; konflik booking aktif diperiksa server untuk semua bus — satu bus berkonflik membatalkan seluruh pengajuan.
              </span>
            </div>
          </form>
        </div>
      )}

      <form method="get" action="/branding/bookings" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Cari brand, perusahaan, nopol, jalur…" style={{ flex: "1 1 260px" }} />
        <input name="lambung" defaultValue={sp.lambung ?? ""} placeholder="Cari nomor lambung…" inputMode="numeric" style={{ flex: "0 1 170px" }} aria-label="Cari nomor lambung" />
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn small">Cari</button>
        {(sp.q || sp.lambung) && <Link className="btn small ghost" href={sp.status ? `/branding/bookings?status=${sp.status}` : "/branding/bookings"}>Reset</Link>}
      </form>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Link className={`btn small ${!sp.status ? "" : "ghost"}`} href={`/branding/bookings${sp.q || sp.lambung ? `?${[sp.q ? `q=${encodeURIComponent(sp.q)}` : "", sp.lambung ? `lambung=${encodeURIComponent(sp.lambung)}` : ""].filter(Boolean).join("&")}` : ""}`}>Semua</Link>
        <Link className="btn small ghost" href="/branding/history">History</Link>
        {BOOKING_STATUSES.map((s) => (
          <Link key={s} className={`btn small ${sp.status === s ? "" : "ghost"}`} href={`/branding/bookings?status=${s}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${sp.lambung ? `&lambung=${encodeURIComponent(sp.lambung)}` : ""}`}>
            {s}
          </Link>
        ))}
      </div>
      <BrandingTransactionTable rows={rows} buses={(buses ?? []) as BrandingBusOption[]} canManage={canManage} adjustments={Object.fromEntries(adjMap)} canOverride={ctx?.permissions.includes("branding.total.override") ?? false} />
      <p className="muted small-text" style={{ marginTop: 10 }}>
        Setiap Nomor Referensi menampilkan seluruh bus anggotanya. Status Selesai dihitung otomatis dari tanggal akhir dalam zona waktu Asia/Jakarta.
      </p>
    </>
  );
}
