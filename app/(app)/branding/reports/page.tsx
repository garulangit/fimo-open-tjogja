import { applyAdjustments, loadActiveAdjustments } from "@/lib/branding-adjust";
import { groupKeyOf } from "@/lib/branding-adjust";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus, formatRupiah, monthKeysBetween, PLACEMENTS } from "@/lib/branding";

interface Row {
  id: string; reference_no: string | null; brand_name: string; company_name: string | null; placement: string;
  start_date: string; end_date: string; status: string;
  pricing_snapshot: { basePrice?: number; ppn?: number; totalWithPpn?: number; monthlyRevenue?: number; duration?: number } | null;
  branding_buses: { no_polisi: string } | null;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("branding_bookings")
    .select("*, branding_buses(no_polisi)")
    .order("start_date", { ascending: false });
  const adjMap = await loadActiveAdjustments(supabase);
  const rows = applyAdjustments((data ?? []) as unknown as Row[], adjMap);

  // Sorting Rekap (revisi 1.0.1 C.7): brand / periode mulai / total kontrak.
  const sortKey = ["brand", "start", "total"].includes(sp.sort ?? "") ? sp.sort! : "start";
  const dirMul = sp.dir === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "brand") return dirMul * a.brand_name.localeCompare(b.brand_name);
    if (sortKey === "total")
      return dirMul * ((a.pricing_snapshot?.totalWithPpn ?? 0) - (b.pricing_snapshot?.totalWithPpn ?? 0));
    return dirMul * a.start_date.localeCompare(b.start_date);
  });
  const sortLink = (key: string, label: string) => {
    const nextDir = sortKey === key && sp.dir !== "asc" ? "asc" : "desc";
    const arrow = sortKey === key ? (sp.dir === "asc" ? " ↑" : " ↓") : "";
    return (
      <Link className="th-sort" href={`/branding/reports?sort=${key}&dir=${nextDir}`}>
        {label}{arrow}
      </Link>
    );
  };

  const monthly = new Map<string, number>();
  for (const r of rows) {
    const mr = Number(r.pricing_snapshot?.monthlyRevenue) || 0;
    if (!mr) continue;
    for (const key of monthKeysBetween(r.start_date, r.end_date)) {
      monthly.set(key, (monthly.get(key) ?? 0) + mr);
    }
  }
  const monthRows = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const label = (key: string) =>
    new Date(key + "-01T00:00:00Z").toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Alokasi Revenue Bulanan</h3>
        <p className="muted small-text">
          Revenue kontrak multi-bulan disebar merata per bulan kalender (pola legacy), dari snapshot harga tiap booking.
        </p>
        <table>
          <thead><tr><th>No.</th><th>Bulan</th><th>Revenue (sebelum PPN)</th></tr></thead>
          <tbody>
            {monthRows.map(([key, val], i) => (
              <tr key={key}><td className="muted">{i + 1}</td><td>{label(key)}</td><td>{formatRupiah(val)}</td></tr>
            ))}
            {monthRows.length === 0 && <tr><td colSpan={3} className="muted">Belum ada data revenue.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 6, overflowX: "auto" }}>
        <h3 style={{ margin: "14px 14px 8px" }}>Rekap Branding</h3>
        <table>
          <thead>
            <tr>
              <th>No.</th><th>{sortLink("brand", "Brand")}</th><th>Nomor Referensi</th><th>Bus</th>
              <th>Penempatan</th><th>{sortLink("start", "Periode")}</th><th>Status</th>
              <th>Dasar</th><th>PPN</th><th>{sortLink("total", "Total")}</th><th>/Bulan</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id}>
                <td className="muted">{i + 1}</td>
                <td><strong>{r.brand_name}</strong>{r.company_name && <div className="muted small-text">{r.company_name}</div>}</td>
                <td><span className="ref-mono">{r.reference_no ?? "-"}</span></td>
                <td>{r.branding_buses?.no_polisi ?? "-"}</td>
                <td>{PLACEMENTS[r.placement as keyof typeof PLACEMENTS] ?? r.placement}</td>
                <td className="small-text">{r.start_date} → {r.end_date}</td>
                <td>{effectiveStatus(r.status, r.end_date)}</td>
                <td>{formatRupiah(r.pricing_snapshot?.basePrice)}</td>
                <td>{formatRupiah(r.pricing_snapshot?.ppn)}</td>
                <td>{formatRupiah(r.pricing_snapshot?.totalWithPpn)}{adjMap.has(groupKeyOf(r as never)) && <> <span className="tag on">Nego</span></>}</td>
                <td>{formatRupiah(r.pricing_snapshot?.monthlyRevenue)}</td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={11} className="muted">Belum ada booking.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
