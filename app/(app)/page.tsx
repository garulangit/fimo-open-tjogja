import { applyAdjustments, loadActiveAdjustments } from "@/lib/branding-adjust";
import Link from "next/link";
import { Bus, CalendarRange, ClipboardList, FileCheck2, Gauge, Wallet } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus, monthKeysBetween } from "@/lib/branding";
import { CLAIM_STATUS_LABELS } from "@/lib/claim";
import {
  BarChart,
  CLAIM_STATUS_COLORS,
  DashCard,
  Donut,
  KpiCard,
} from "@/components/dashboard/Dash";
import { CompanyDistribution, type BrandingBusInfo } from "@/components/dashboard/BrandingInsights";

// Dashboard Utama — executive overview lintas modul (adaptasi design system
// Tabler, MIT). Semua angka dari data aktual Branding + Klaim; kategori
// keuangan booking dan subsidi ditampilkan TERPISAH, tidak pernah dijumlahkan.

interface Bk {
  id: string;
  bus_id: string;
  brand_name: string;
  company_name: string | null;
  reference_no: string | null;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  pricing_snapshot: { monthlyRevenue?: number; totalWithPpn?: number } | null;
  branding_buses: { no_polisi: string } | null;
}
interface Cl {
  id: string;
  claim_number: string;
  operator_name: string;
  status: string;
  period_month: number;
  period_year: number;
  calculated_subsidy: number;
  created_at: string;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export default async function DashboardPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const hasBranding = ctx.permissions.some((p) => p.startsWith("branding."));
  const hasClaim = ctx.permissions.some((p) => p.startsWith("claim."));
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const [busesRes, bookingsRes, claimsRes, claimCountRes] = await Promise.all([
    hasBranding
      ? supabase.from("branding_buses").select("id, no_polisi, hull_no, route")
      : Promise.resolve({ data: [] as { id: string; no_polisi: string; hull_no: string | null; route: string | null }[] }),
    hasBranding
      ? supabase
          .from("branding_bookings")
          .select("id, bus_id, brand_name, company_name, reference_no, start_date, end_date, status, created_at, pricing_snapshot, branding_buses(no_polisi)")
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
    hasClaim
      ? supabase
          .from("claims")
          .select("id, claim_number, operator_name, status, period_month, period_year, calculated_subsidy, created_at")
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
    hasClaim
      ? supabase.from("claims").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: 0 }),
  ]);

  const buses = busesRes.data ?? [];
  const bookings = applyAdjustments((bookingsRes.data ?? []) as unknown as Bk[], await loadActiveAdjustments(supabase));
  const brandingLoadError = ("error" in busesRes && Boolean(busesRes.error))
    || ("error" in bookingsRes && Boolean(bookingsRes.error));
  const claims = (claimsRes.data ?? []) as unknown as Cl[];
  const totalClaims = claimCountRes.count ?? claims.length;

  const eff = (b: Bk) => effectiveStatus(b.status, b.end_date);
  const activeBookings = bookings.filter((b) => eff(b) !== "SELESAI");
  const running = bookings.filter((b) => b.start_date <= today && b.end_date >= today && eff(b) !== "SELESAI");
  const busyBuses = new Set(running.map((b) => b.branding_buses?.no_polisi).filter(Boolean));
  const occupancy = buses.length ? Math.round((busyBuses.size / buses.length) * 100) : 0;

  const claimByStatus = new Map<string, number>();
  for (const c of claims) claimByStatus.set(c.status, (claimByStatus.get(c.status) ?? 0) + 1);
  const claimQueue = claimByStatus.get("IN_REVIEW") ?? 0;
  const claimSubmitted = claimByStatus.get("SUBMITTED") ?? 0;
  const subsidyApprovedYear = claims
    .filter((c) => c.period_year === year && ["APPROVED", "COMPLETED"].includes(c.status))
    .reduce((s, c) => s + Number(c.calculated_subsidy), 0);

  // Tren 6 bulan: aktivitas dibuat (booking & klaim per bulan pembuatan).
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.slice(0, 7) + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - i);
    monthKeys.push(d.toISOString().slice(0, 7));
  }
  const perMonth = (items: { created_at: string }[]) =>
    monthKeys.map((k) => items.filter((x) => x.created_at.slice(0, 7) === k).length);
  const bookingTrend = perMonth(bookings);
  const claimTrend = perMonth(claims);
  const trendLabels = monthKeys.map((k) => MONTH_SHORT[Number(k.slice(5, 7)) - 1]);

  // Sparkline revenue bulanan branding (alokasi snapshot).
  const monthlyRev = new Map<string, number>();
  for (const b of bookings) {
    const mr = Number(b.pricing_snapshot?.monthlyRevenue) || 0;
    if (!mr) continue;
    for (const key of monthKeysBetween(b.start_date, b.end_date)) monthlyRev.set(key, (monthlyRev.get(key) ?? 0) + mr);
  }
  const revenueSpark = monthKeys.map((k) => monthlyRev.get(k) ?? 0);
  const yearRevenue = Array.from({ length: 12 }, (_, month) =>
    monthlyRev.get(`${year}-${String(month + 1).padStart(2, "0")}`) ?? 0,
  ).reduce((sum, value) => sum + value, 0);

  const bookingsByBus = new Map<string, BrandingBusInfo["bookings"]>();
  for (const booking of bookings) {
    bookingsByBus.set(booking.bus_id, [...(bookingsByBus.get(booking.bus_id) ?? []), {
      id: booking.id,
      brand_name: booking.brand_name,
      company_name: booking.company_name,
      start_date: booking.start_date,
      end_date: booking.end_date,
      status: eff(booking),
    }]);
  }
  const insightBuses: BrandingBusInfo[] = buses.map((bus) => ({ ...bus, bookings: bookingsByBus.get(bus.id) ?? [] }));

  const claimDonut = Object.keys(CLAIM_STATUS_LABELS).map((s) => ({
    label: CLAIM_STATUS_LABELS[s],
    value: claimByStatus.get(s) ?? 0,
    color: CLAIM_STATUS_COLORS[s],
  }));

  type Act = { when: string; module: "branding" | "claim"; title: string; desc: string; status: string; href: string };
  const activity: Act[] = [
    ...bookings.slice(0, 8).map((b): Act => ({
      when: b.created_at,
      module: "branding",
      title: b.brand_name,
      desc: `${b.branding_buses?.no_polisi ?? "-"} · ${b.start_date} s.d. ${b.end_date}`,
      status: eff(b),
      href: "/branding/bookings",
    })),
    ...claims.slice(0, 8).map((c): Act => ({
      when: c.created_at,
      module: "claim",
      title: c.claim_number,
      desc: `${c.operator_name} · Periode ${c.period_month}/${c.period_year}`,
      status: CLAIM_STATUS_LABELS[c.status] ?? c.status,
      href: `/claim/${c.id}`,
    })),
  ]
    .sort((a, b) => b.when.localeCompare(a.when))
    .slice(0, 8);

  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Halo, {ctx.displayName || ctx.username}</h1>
          <p className="subtitle">Ringkasan operasional Angkutan Perkotaan — Branding dan Klaim Subsidi dari data aktual.</p>
        </div>
        <div className="muted small-text">{todayLabel}</div>
      </div>

      {(hasBranding || hasClaim) && (
        <>
          <div className="dash-grid">
            {hasBranding && (
              <>
                <KpiCard span={4} label="Total Armada" icon={Bus} tone="green" num={buses.length} note={`${Math.max(0, buses.length - busyBuses.size)} bus tersedia hari ini`} spark={bookingTrend} delay={0.02} />
                <KpiCard span={4} label="Booking Aktif" icon={CalendarRange} tone="blue" num={activeBookings.length} note={`${running.length} sedang berjalan · okupansi ${occupancy}%`} spark={bookingTrend} delay={0.06} />
                <KpiCard span={4} label="Pendapatan Tahun Berjalan" icon={Wallet} tone="violet" num={yearRevenue} numFormat="rpCompact" note={`Branding — alokasi pendapatan ${year} dari snapshot harga (sebelum PPN)`} spark={revenueSpark} delay={0.1} />
              </>
            )}
            {hasClaim && (
              <>
                <KpiCard span={4} label="Total Pengajuan Klaim" icon={ClipboardList} tone="blue" num={totalClaims} note="seluruh klaim subsidi tercatat" spark={claimTrend} delay={0.14} />
                <KpiCard span={4} label="Menunggu Verifikasi" icon={FileCheck2} tone="amber" num={claimQueue} note={`${claimSubmitted} diajukan belum diproses`} spark={claimTrend} delay={0.18} />
                <KpiCard label={`Subsidi Disetujui ${year}`} span={4} icon={Gauge} tone="teal" num={subsidyApprovedYear} numFormat="rpCompact" note="Klaim — status Disetujui / Selesai" spark={claimTrend} delay={0.22} />
              </>
            )}
          </div>

          <div className="dash-grid">
            <DashCard span={8} title="Aktivitas Operasional" sub="Booking dan klaim dibuat per bulan, 6 bulan terakhir">
              <BarChart
                labels={trendLabels}
                series={[
                  { name: "Booking dibuat", color: "#177245", values: bookingTrend },
                  { name: "Klaim dibuat", color: "#b97f14", values: claimTrend },
                ]}
              />
            </DashCard>
            {hasBranding && (
              <DashCard span={4} title="Distribusi Branding Berdasarkan Company" sub="Proporsi bus terbranding hari ini">
                <CompanyDistribution buses={insightBuses} today={today} loadError={brandingLoadError} />
              </DashCard>
            )}
            {hasClaim && (
              <DashCard span={4} title="Status Klaim" sub="Seluruh pengajuan pada sampel data terbaru">
                <Donut data={claimDonut} centerValue={String(claims.length)} centerLabel="klaim" />
              </DashCard>
            )}
            <DashCard
              span={hasBranding && hasClaim ? 8 : 12}
              title="Aktivitas Terbaru"
              sub="Lintas modul, urut waktu pembuatan"
              action={<Link href="/branding/bookings" className="small-text">Branding</Link>}
            >
              {activity.length === 0 ? (
                <p className="kpi-note">Belum ada aktivitas tercatat.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr><th>Waktu</th><th>Modul</th><th>Aktivitas</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {activity.map((a, i) => (
                        <tr key={i}>
                          <td className="small-text muted" style={{ whiteSpace: "nowrap" }}>
                            {new Date(a.when).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                          </td>
                          <td><span className={`mod-badge ${a.module}`}>{a.module === "branding" ? "Branding" : "Klaim"}</span></td>
                          <td>
                            <Link href={a.href}><strong>{a.title}</strong></Link>
                            <div className="muted small-text">{a.desc}</div>
                          </td>
                          <td><span className="tag">{a.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DashCard>
          </div>
        </>
      )}

    </>
  );
}
