import { applyAdjustments, loadActiveAdjustments } from "@/lib/branding-adjust";
import { Bus, CalendarRange, CircleAlert, Gauge, Tags, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus, formatRupiah, monthKeysBetween, PLACEMENTS } from "@/lib/branding";
import { BarChart, DashCard, KpiCard } from "@/components/dashboard/Dash";
import BrandingInsights, { type BrandingBusInfo } from "@/components/dashboard/BrandingInsights";
import BrandingPeriodFilter from "@/components/dashboard/BrandingPeriodFilter";

// Overview Branding — fleet & rental operations (adaptasi design system
// Tabler, MIT). Semua angka dari data aktual booking/bus staging.

interface Bk {
  id: string; bus_id: string; reference_no: string | null; brand_name: string; company_name: string | null;
  placement: string; start_date: string; end_date: string; status: string; created_at: string;
  pricing_snapshot: { monthlyRevenue?: number; totalWithPpn?: number } | null;
  branding_buses: { no_polisi: string } | null;
}
interface BusRow { id: string; no_polisi: string; hull_no: string | null; route: string | null }

const fmtCompact = (n: number) =>
  n >= 1_000_000_000
    ? `Rp ${(n / 1_000_000_000).toFixed(1).replace(".", ",")} M`
    : n >= 1_000_000
      ? `Rp ${Math.round(n / 1_000_000)} jt`
      : formatRupiah(n);

export default async function BrandingOverview({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const supabase = await createClient();
  const [busesResult, bookingsResult] = await Promise.all([
    supabase.from("branding_buses").select("id, no_polisi, hull_no, route").order("route").order("no_polisi"),
    supabase
      .from("branding_bookings")
      .select("id, bus_id, reference_no, brand_name, company_name, placement, start_date, end_date, status, created_at, pricing_snapshot, branding_buses(no_polisi)")
      .order("end_date"),
  ]);
  const buses = busesResult.data;
  const bookings = bookingsResult.data;
  const insightLoadError = Boolean(busesResult.error || bookingsResult.error);
  const busRows = (buses ?? []) as BusRow[];
  const rows = applyAdjustments((bookings ?? []) as unknown as Bk[], await loadActiveAdjustments(supabase));
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const requested = await searchParams;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDate = (value: string | undefined) => {
    if (!value || !datePattern.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const requestedStart = isValidDate(requested.start) ? requested.start! : `${currentYear}-01-01`;
  const requestedEnd = isValidDate(requested.end) ? requested.end! : `${currentYear}-12-31`;
  const periodStart = requestedStart <= requestedEnd ? requestedStart : `${currentYear}-01-01`;
  const periodEnd = requestedStart <= requestedEnd ? requestedEnd : `${currentYear}-12-31`;
  const selectedYear = Number(periodStart.slice(0, 4));
  const selectedMonth = Number(periodStart.slice(5, 7));
  const periodLabel = `${new Date(`${periodStart}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "UTC" })} – ${new Date(`${periodEnd}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
  const inDays = (d: string) => Math.round((new Date(d).getTime() - new Date(today).getTime()) / 86400000);
  const eff = (b: Bk) => effectiveStatus(b.status, b.end_date);

  const monthly = new Map<string, number>();
  for (const b of rows) {
    const mr = Number(b.pricing_snapshot?.monthlyRevenue) || 0;
    if (!mr) continue;
    for (const key of monthKeysBetween(b.start_date, b.end_date)) monthly.set(key, (monthly.get(key) ?? 0) + mr);
  }
  const periodBookings = rows.filter((b) => b.status !== "SELESAI" && b.start_date <= periodEnd && b.end_date >= periodStart);
  const busyBusIds = new Set(periodBookings.map((b) => b.bus_id));
  const availableBuses = busRows.filter((b) => !busyBusIds.has(b.id));
  const totalBus = busRows.length;
  const occupancy = totalBus ? Math.round((busyBusIds.size / totalBus) * 100) : 0;
  const revenuePeriod = [...monthly.entries()].reduce((sum, [key, amount]) => {
    const monthStart = `${key}-01`;
    const monthEnd = `${key}-${String(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
    if (monthStart > periodEnd || monthEnd < periodStart) return sum;
    const overlapStart = monthStart < periodStart ? periodStart : monthStart;
    const overlapEnd = monthEnd > periodEnd ? periodEnd : monthEnd;
    const days = Math.round((Date.parse(`${overlapEnd}T00:00:00Z`) - Date.parse(`${overlapStart}T00:00:00Z`)) / 86400000) + 1;
    return sum + amount * days / new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
  }, 0);

  const trendKeys: string[] = [];
  const firstMonth = new Date(`${periodStart.slice(0, 7)}-01T00:00:00Z`);
  const lastMonth = new Date(`${periodEnd.slice(0, 7)}-01T00:00:00Z`);
  for (let d = new Date(firstMonth); d <= lastMonth; d.setUTCMonth(d.getUTCMonth() + 1)) {
    trendKeys.push(d.toISOString().slice(0, 7));
  }
  const trendVals = trendKeys.map((k) => monthly.get(k) ?? 0);
  const trendLabels = trendKeys.map((k) =>
    new Date(k + "-01T00:00:00Z").toLocaleDateString("id-ID", { month: "short", timeZone: "UTC" }),
  );

  const byPlacement = Object.keys(PLACEMENTS).map((p) => ({
    label: PLACEMENTS[p as keyof typeof PLACEMENTS],
    n: periodBookings.filter((b) => b.placement === p).length,
  }));

  const expiring7 = rows.filter((b) => eff(b) !== "SELESAI" && inDays(b.end_date) >= 0 && inDays(b.end_date) <= 7);
  const expiring30 = rows.filter((b) => eff(b) !== "SELESAI" && inDays(b.end_date) > 7 && inDays(b.end_date) <= 30);
  const expiredRecent = rows.filter((b) => b.status !== "SELESAI" && inDays(b.end_date) < 0 && inDays(b.end_date) >= -30);
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const bookingByBus = new Map<string, BrandingBusInfo["bookings"]>();
  for (const booking of rows) {
    const busId = booking.bus_id;
    if (!busId) continue;
    bookingByBus.set(busId, [...(bookingByBus.get(busId) ?? []), {
      id: booking.id,
      reference_no: booking.reference_no,
      brand_name: booking.brand_name,
      company_name: booking.company_name,
      start_date: booking.start_date,
      end_date: booking.end_date,
      status: booking.status,
    }]);
  }
  const insightBuses: BrandingBusInfo[] = busRows.map((bus) => ({
    ...bus,
    bookings: bookingByBus.get(bus.id) ?? [],
  }));

  return (
    <div className="branding-overview">
      <div className="page-head">
        <div><h1>Overview</h1><p className="subtitle">Branding FIMO — operasi armada dan penyewaan ruang iklan dari data aktual.</p></div>
        <div className="muted small-text">{todayLabel}</div>
      </div>

      <BrandingPeriodFilter start={periodStart} end={periodEnd} currentYear={currentYear} />

      <section className="overview-kpis" aria-label="KPI periode terpilih">
        <KpiCard label="Total Bus" icon={Bus} tone="green" num={totalBus} note={`${availableBuses.length} tersedia pada periode ini`} />
        <KpiCard label="Booking Aktif" icon={CalendarRange} tone="blue" num={periodBookings.length} note={`${busyBusIds.size} armada digunakan pada periode ini`} />
        <KpiCard label="Okupansi Armada" icon={Gauge} tone="amber" num={occupancy} numFormat="pct" note={`${busyBusIds.size} dari ${totalBus} bus terbranding`} />
        <KpiCard label="Revenue Periode" icon={Wallet} tone="violet" num={revenuePeriod} numFormat="rpCompact" note={periodLabel} spark={trendVals} />
        <KpiCard label="Penempatan Aktif" icon={Tags} tone="teal" num={byPlacement.filter((item) => item.n > 0).length} note={byPlacement.filter((item) => item.n > 0).map((item) => `${item.label}: ${item.n}`).join(" · ") || "Tidak ada penempatan pada periode ini"} />
      </section>

      <div className="branding-pair">
        <DashCard title="Tren Revenue" sub="Alokasi pendapatan per bulan dari snapshot harga booking (sebelum PPN)">
          <div className="revenue-chart"><BarChart labels={trendLabels} formatTick={(n) => fmtCompact(n).replace("Rp ", "")} series={[{ name: "Revenue", color: "#177245", values: trendVals, displays: trendVals.map((value) => (value ? fmtCompact(value) : "")) }]} /></div>
          <div className="revenue-total"><span>Estimasi pendapatan {periodLabel}</span><strong>{formatRupiah(revenuePeriod)}</strong></div>
        </DashCard>
        <BrandingInsights section="company" buses={insightBuses} periodStart={periodStart} periodEnd={periodEnd} initialMonth={selectedMonth} initialYear={selectedYear} loadError={insightLoadError} />
      </div>

      <div className="branding-pair">
        <DashCard title="Ketersediaan Armada" sub={`Berdasarkan booking yang beririsan dengan ${periodLabel}`}>
          <div className="availability-summary"><div><strong>{availableBuses.length}</strong><span>Tersedia</span></div><div><strong>{busyBusIds.size}</strong><span>Terbranding</span></div><div><strong>{totalBus}</strong><span>Total armada</span></div></div>
          {availableBuses.length === 0 ? <p className="kpi-note">Tidak ada bus tersedia pada periode ini.</p> : <div className="table-scroll"><table><thead><tr><th>No Polisi</th><th>Lambung</th><th>Koridor</th></tr></thead><tbody>{availableBuses.slice(0, 6).map((bus) => <tr key={bus.id}><td>{bus.no_polisi}</td><td>{bus.hull_no ?? "-"}</td><td>{bus.route ?? "-"}</td></tr>)}</tbody></table></div>}
          {availableBuses.length > 6 && <p className="kpi-note">+{availableBuses.length - 6} bus lainnya — lihat Data Bus.</p>}
        </DashCard>
        <DashCard title="Peringatan Kontrak" sub="Kontrak yang segera berakhir atau baru kedaluwarsa">
        <h4 style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 7, fontSize: 13.5 }}>
          <CircleAlert size={15} /> Perlu tindak lanjut
        </h4>
        {[
          { title: "Berakhir ≤ 7 hari", items: expiring7 },
          { title: "Berakhir ≤ 30 hari", items: expiring30 },
          { title: "Baru berakhir (30 hari terakhir, status belum SELESAI)", items: expiredRecent },
        ].map((bucket) =>
          bucket.items.length === 0 ? (
            <p key={bucket.title} className="muted small-text">{bucket.title}: tidak ada.</p>
          ) : (
            <div key={bucket.title} style={{ marginBottom: 10 }}>
              <div className="small-text" style={{ fontWeight: 700, marginBottom: 4 }}>{bucket.title} ({bucket.items.length})</div>
              {bucket.items.map((b) => (
                <div key={b.id} className="small-text">
                  {b.brand_name} — {b.branding_buses?.no_polisi ?? "-"} — berakhir {b.end_date} ({inDays(b.end_date)} hari)
                </div>
              ))}
            </div>
          ),
        )}
        </DashCard>
      </div>

      <div className="branding-pair">
        <BrandingInsights section="corridor" buses={insightBuses} periodStart={periodStart} periodEnd={periodEnd} initialMonth={selectedMonth} initialYear={selectedYear} loadError={insightLoadError} />
        <BrandingInsights section="monitoring" buses={insightBuses} periodStart={periodStart} periodEnd={periodEnd} initialMonth={selectedMonth} initialYear={selectedYear} loadError={insightLoadError} />
      </div>

      <BrandingInsights section="calendar" buses={insightBuses} periodStart={periodStart} periodEnd={periodEnd} initialMonth={selectedMonth} initialYear={selectedYear} loadError={insightLoadError} />
    </div>
  );
}
