"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

export interface BrandingBusInfo {
  id: string;
  route: string | null;
  no_polisi: string;
  hull_no: string | null;
  bookings: Array<{
    id: string;
    reference_no?: string | null;
    brand_name: string;
    company_name: string | null;
    start_date: string;
    end_date: string;
    status: string;
  }>;
}

const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function addMonths(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

function currentBooking(bus: BrandingBusInfo, start: string, end: string) {
  return bus.bookings.find((booking) =>
    booking.start_date <= end && booking.end_date >= start && booking.status !== "SELESAI",
  );
}

function overlapBooking(bus: BrandingBusInfo, start: string, end: string) {
  return bus.bookings.find((booking) => booking.start_date <= end && booking.end_date >= start);
}

export function CompanyDistribution({ buses, periodStart, periodEnd, today, loadError = false }: { buses: BrandingBusInfo[]; periodStart?: string; periodEnd?: string; today?: string; loadError?: boolean }) {
  const start = periodStart ?? today ?? "";
  const end = periodEnd ?? today ?? "";
  const companyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bus of buses) {
      const booking = currentBooking(bus, start, end);
      if (booking) {
        const company = booking.company_name?.trim() || "Perusahaan tidak tercatat";
        counts.set(company, (counts.get(company) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "id"));
  }, [buses, start, end]);
  const total = companyCounts.reduce((sum, [, count]) => sum + count, 0);
  const colors = ["#177245", "#2563eb", "#7c3aed", "#d97706", "#0e9594", "#dc2626", "#64748b"];
  let angle = 0;
  const segments = companyCounts.map(([company, count], index) => {
    const start = angle;
    angle += count / (total || 1) * 360;
    return `${colors[index % colors.length]} ${start}deg ${angle}deg`;
  });
  if (loadError) return <p className="kpi-note">Data distribusi company gagal dimuat. Coba muat ulang halaman.</p>;
  if (!total) return <p className="kpi-note">Belum ada armada terbranding pada periode terpilih.</p>;
  return <div className="company-distribution">
    <div className="company-donut" role="img" aria-label={`Distribusi ${total} bus terbranding berdasarkan perusahaan`} style={{ background: `conic-gradient(${segments.join(", ")})` }}>
      <div><strong>{total}</strong><span>bus</span></div>
    </div>
    <ul className="company-legend">
      {companyCounts.map(([company, count], index) => <li key={company}><i style={{ background: colors[index % colors.length] }} /><span title={company}>{company}</span><b>{count} bus · {Math.round(count / total * 100)}%</b></li>)}
    </ul>
  </div>;
}

type InsightSection = "all" | "company" | "corridor" | "monitoring" | "calendar";

export default function BrandingInsights({ buses, periodStart, periodEnd, initialMonth, initialYear, loadError = false, section = "all" }: { buses: BrandingBusInfo[]; periodStart: string; periodEnd: string; initialMonth: number; initialYear: number; loadError?: boolean; section?: InsightSection }) {
  const [openRoutes, setOpenRoutes] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState(() => ({ year: initialYear, month: initialMonth - 1 }));

  const routes = useMemo(() => {
    const groups = new Map<string, BrandingBusInfo[]>();
    for (const bus of buses) {
      const route = bus.route?.trim() || "Koridor tidak tercatat";
      groups.set(route, [...(groups.get(route) ?? []), bus]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const aMatch = a.match(/^(\d+)(.*)$/);
      const bMatch = b.match(/^(\d+)(.*)$/);
      if (aMatch && bMatch) return Number(aMatch[1]) - Number(bMatch[1]) || aMatch[2].localeCompare(bMatch[2], "id");
      return a.localeCompare(b, "id");
    });
  }, [buses]);


  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const monthStart = `${month.year}-${String(month.month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${daysInMonth}`;
  const dayNumbers = Array.from({ length: daysInMonth }, (_, index) => index + 1);

  if (loadError) return <div className="branding-insights"><section className="dash-card insight-card"><p className="kpi-note">Data armada dan booking gagal dimuat. Coba muat ulang halaman.</p></section></div>;

  return (
    <div className="branding-insights">
      {(section === "all" || section === "company") && <section className="dash-card insight-card">
        <div className="dash-card-head"><div><h3>Distribusi Branding Berdasarkan Company</h3><p>Bus dengan periode branding aktif pada periode terpilih</p></div></div>
        <CompanyDistribution buses={buses} periodStart={periodStart} periodEnd={periodEnd} />
      </section>}

      {(section === "all" || section === "corridor") && <section className="dash-card insight-card">
        <div className="dash-card-head"><div><h3>Distribusi Branding per Koridor</h3><p>Bus terbranding dan belum terbranding pada periode terpilih</p></div></div>
        {routes.length === 0 ? <p className="kpi-note">Data armada belum tersedia.</p> : <div className="corridor-bars">
          {routes.map(([route, routeBuses]) => {
            const branded = routeBuses.filter((bus) => currentBooking(bus, periodStart, periodEnd)).length;
            const free = routeBuses.length - branded;
            const share = routeBuses.length ? branded / routeBuses.length * 100 : 0;
            return <div className="corridor-row" key={route}><div className="corridor-label"><strong>{route}</strong><span>{branded}/{routeBuses.length} bus</span></div><div className="corridor-track" role="img" aria-label={`${route}: ${branded} terbranding, ${free} belum terbranding`}><span className="corridor-used" style={{ width: `${share}%` }} /><span className="corridor-free" style={{ width: `${100 - share}%` }} /></div><div className="corridor-counts"><span>🟢 {branded}</span><span>🟡 {free}</span></div></div>;
          })}
        </div>}
      </section>}

      {(section === "all" || section === "monitoring") && <section className="dash-card insight-card corridor-monitoring">
        <div className="dash-card-head"><div><h3>Monitoring Armada</h3><p>Assignment branding dikelompokkan per koridor pada periode terpilih</p></div></div>
        {routes.length === 0 ? <p className="kpi-note">Data armada belum tersedia.</p> : <div className="route-accordion-grid">
          {routes.map(([route, routeBuses]) => {
            const branded = routeBuses.filter((bus) => currentBooking(bus, periodStart, periodEnd)).length;
            const open = openRoutes.has(route);
            return <section className={`route-accordion${open ? " is-open" : ""}`} key={route}>
              <button className="route-accordion-toggle" type="button" aria-expanded={open} onClick={() => setOpenRoutes((previous) => { const next = new Set(previous); if (next.has(route)) next.delete(route); else next.add(route); return next; })}>
                <span>JALUR {route} <small>({branded}/{routeBuses.length} BUS)</small></span><ChevronDown size={17} aria-hidden="true" />
              </button>
              <div className="route-accordion-panel" aria-hidden={!open}><div className="route-accordion-inner"><div className="bus-info-grid">
                {routeBuses.map((bus) => {
                  const booking = currentBooking(bus, periodStart, periodEnd);
                  return <article className={`bus-info-card${booking ? " is-branded" : ""}`} key={bus.id}>
                    <strong>{route} · {bus.hull_no?.trim() || bus.no_polisi || "—"}</strong>
                    <span className={`tag ${booking ? "on" : ""}`}>{booking ? booking.status : "KOSONG"}</span>
                    <p>{booking?.company_name?.trim() || "Perusahaan tidak tercatat"}</p>
                    <b>{booking?.brand_name?.trim() || "Brand tidak tercatat"}</b>
                  </article>;
                })}
              </div></div></div>
            </section>;
          })}
        </div>}
      </section>}

      {(section === "all" || section === "calendar") && <section className="dash-card insight-card branding-calendar">
        <div className="calendar-heading"><div><h3>Kalender Branding</h3><p>Periode booking yang beririsan dengan bulan terpilih</p></div><div className="calendar-navigation"><button type="button" className="btn secondary small" aria-label="Bulan sebelumnya" onClick={() => setMonth((value) => addMonths(value.year, value.month, -1))}><ChevronLeft size={16} /></button><strong aria-live="polite">{monthLabel(month.year, month.month)}</strong><button type="button" className="btn secondary small" aria-label="Bulan berikutnya" onClick={() => setMonth((value) => addMonths(value.year, value.month, 1))}><ChevronRight size={16} /></button><label className="calendar-year">Tahun<select value={month.year} onChange={(event) => setMonth((value) => ({ ...value, year: Number(event.target.value) }))}>{Array.from({ length: 11 }, (_, i) => month.year - 5 + i).map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div></div>
        {buses.length === 0 ? <p className="kpi-note">Data armada belum tersedia.</p> : <div className="calendar-scroll"><div className="calendar-grid" style={{ "--days-in-month": daysInMonth } as React.CSSProperties}><div className="calendar-corner">Koridor · Armada</div><div className="calendar-days" style={{ "--days-in-month": daysInMonth } as React.CSSProperties}>{dayNumbers.map((day) => <span key={day}>{day}</span>)}</div>
          {routes.flatMap(([route, routeBuses]) => routeBuses.map((bus) => {
            const booking = overlapBooking(bus, monthStart, monthEnd);
            const start = booking && booking.start_date > monthStart ? Number(booking.start_date.slice(8, 10)) : 1;
            const end = booking && booking.end_date < monthEnd ? Number(booking.end_date.slice(8, 10)) : daysInMonth;
            const startColumn = start;
            const endColumn = end;
            const name = `${route} · ${bus.hull_no?.trim() || bus.no_polisi || "—"}`;
            return <div className="calendar-bus-row" key={bus.id}><span title={name}>{name}</span><div className="calendar-day-track" style={{ "--days-in-month": daysInMonth } as React.CSSProperties}>{booking && <div className="calendar-period" style={{ gridColumn: `${startColumn} / ${endColumn + 1}` }} title={`${booking.reference_no ? booking.reference_no + " · " : ""}${booking.company_name || "Perusahaan tidak tercatat"} · ${booking.brand_name || "Brand tidak tercatat"} · ${bus.no_polisi} · ${booking.start_date} – ${booking.end_date}`}><b>{booking.company_name || "Perusahaan tidak tercatat"}</b><span>{booking.brand_name}</span></div>}</div></div>;
          }))}
          {routes.every(([, routeBuses]) => routeBuses.every((bus) => !overlapBooking(bus, monthStart, monthEnd))) && <p className="calendar-empty">Tidak ada periode branding pada bulan ini.</p>}
        </div></div>}
      </section>}
    </div>
  );
}
