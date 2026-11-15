import Link from "next/link";
import { ClipboardList, FileCheck2, FilePlus2, FileWarning, BadgeCheck, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth";
import { formatRupiah } from "@/lib/branding";
import { CLAIM_STATUS_LABELS, MONTH_NAMES } from "@/lib/claim";
import { BarChart, CLAIM_STATUS_COLORS, DashCard, Donut, KpiCard } from "@/components/dashboard/Dash";

// Overview Klaim — financial claims management (adaptasi design system
// Tabler, MIT). Semua angka dari data aktual klaim; nominal diajukan dan
// disetujui ditampilkan terpisah dengan label status yang jelas.

const ACTION_LABELS: Record<string, string> = {
  "claim.create": "Pengajuan dibuat",
  "claim.update": "Pengajuan diubah",
  "claim.submit": "Pengajuan dikirim",
  "claim.review": "Verifikasi diproses",
  "claim.approve": "Klaim disetujui",
  "claim.reject": "Klaim ditolak",
  "claim.revision": "Klaim dikembalikan untuk revisi",
  "claim.complete": "Klaim diselesaikan",
  "claim.delete": "Pengajuan dihapus",
};

export default async function ClaimOverview() {
  const ctx = await requireContext("claim.dashboard.view");
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const [{ data: claims }, { count: totalExact }, { data: audit }] = await Promise.all([
    supabase
      .from("claims")
      .select("id, claim_number, status, period_month, period_year, operator_name, calculated_subsidy, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("claims").select("id", { count: "exact", head: true }),
    supabase
      .from("audit_events")
      .select("action, entity_type, created_at")
      .eq("module_code", "claim")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  const rows = claims ?? [];
  const byStatus = new Map<string, number>();
  for (const c of rows) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
  const inReview = byStatus.get("IN_REVIEW") ?? 0;
  const submitted = byStatus.get("SUBMITTED") ?? 0;
  const approvedCount = (byStatus.get("APPROVED") ?? 0) + (byStatus.get("COMPLETED") ?? 0);
  const revision = byStatus.get("REVISION_REQUIRED") ?? 0;
  const yearRows = rows.filter((c) => c.period_year === year);
  const diajukanYear = yearRows.reduce((s, c) => s + Number(c.calculated_subsidy), 0);
  const disetujuiYear = yearRows
    .filter((c) => ["APPROVED", "COMPLETED"].includes(c.status))
    .reduce((s, c) => s + Number(c.calculated_subsidy), 0);
  const canCreate = ctx.permissions.includes("claim.claim.create") || ctx.permissions.includes("claim.claim.edit");

  const trendCounts = MONTH_NAMES.map((_, i) => yearRows.filter((c) => c.period_month === i + 1).length);
  const trendLabels = MONTH_NAMES.map((n) => n.slice(0, 3));
  const donut = Object.keys(CLAIM_STATUS_LABELS).map((s) => ({
    label: CLAIM_STATUS_LABELS[s],
    value: byStatus.get(s) ?? 0,
    color: CLAIM_STATUS_COLORS[s],
  }));
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="subtitle">Klaim Subsidi — pengelolaan pengajuan dan verifikasi dari data aktual.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="muted small-text">{todayLabel}</span>
          {canCreate && (
            <Link className="btn primary small" href="/claim/list">
              <FilePlus2 size={14} /> Buat Pengajuan
            </Link>
          )}
        </div>
      </div>

      <div className="dash-grid">
        <KpiCard span={4} label="Total Pengajuan" icon={ClipboardList} tone="blue" num={totalExact ?? rows.length} note="seluruh klaim tercatat" spark={trendCounts} delay={0.02} />
        <KpiCard span={4} label="Dalam Verifikasi" icon={FileCheck2} tone="amber" num={inReview} note={`${submitted} diajukan belum diproses`} spark={trendCounts} delay={0.06} />
        <KpiCard span={4} label="Disetujui" icon={BadgeCheck} tone="green" num={approvedCount} note="status Disetujui / Selesai" delay={0.1} />
        <KpiCard span={4} label="Perlu Revisi" icon={FileWarning} tone="red" num={revision} note="dikembalikan ke operator" delay={0.14} />
        <KpiCard span={4} label={`Subsidi Diajukan ${year}`} icon={Wallet} tone="violet" num={diajukanYear} numFormat="rp" note="semua status, periode tahun berjalan" delay={0.18} />
        <KpiCard span={4} label={`Subsidi Disetujui ${year}`} icon={Wallet} tone="teal" num={disetujuiYear} numFormat="rp" note="hanya status Disetujui / Selesai" delay={0.22} />
      </div>

      <div className="dash-grid">
        <DashCard span={8} title={`Tren Pengajuan ${year}`} sub="Jumlah klaim per bulan periode (bukan tanggal input)">
          <BarChart
            labels={trendLabels}
            series={[{ name: "Pengajuan", color: "#b97f14", values: trendCounts }]}
          />
          {rows.length === 0 && <p className="kpi-note">Belum ada klaim pada data saat ini.</p>}
        </DashCard>
        <DashCard span={4} title="Status Klaim" sub="Distribusi seluruh status pengajuan">
          <Donut data={donut} centerValue={String(rows.length)} centerLabel="klaim" />
        </DashCard>

        <DashCard span={4} title="Aktivitas Verifikasi Terbaru" sub="Dari audit trail modul Klaim">
          {(audit ?? []).length === 0 ? (
            <p className="kpi-note">Belum ada aktivitas tercatat di audit trail.</p>
          ) : (
            <table>
              <tbody>
                {(audit ?? []).map((a, i) => (
                  <tr key={i}>
                    <td>
                      <strong style={{ fontSize: 13 }}>{ACTION_LABELS[a.action] ?? a.action}</strong>
                      <div className="muted small-text">{a.entity_type ?? "klaim"}</div>
                    </td>
                    <td className="small-text muted" style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      {new Date(a.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}{" "}
                      {new Date(a.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DashCard>

        <DashCard span={8} title="Klaim Terbaru" sub="Pengajuan terakhir dibuat"
          action={<Link href="/claim/list" className="small-text">Semua klaim →</Link>}>
          {rows.length === 0 ? (
            <p className="kpi-note">Belum ada klaim. Buat pengajuan pertama dari menu Daftar Klaim — pastikan pohon kategori biaya sudah terisi di Master Data.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Nomor</th><th>Operator</th><th>Periode</th><th>Status</th><th>Subsidi</th></tr></thead>
                <tbody>
                  {rows.slice(0, 8).map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/claim/${c.id}`}>{c.claim_number}</Link></td>
                      <td>{c.operator_name}</td>
                      <td>{MONTH_NAMES[c.period_month - 1]} {c.period_year}</td>
                      <td><span className="tag">{CLAIM_STATUS_LABELS[c.status]}</span></td>
                      <td>{formatRupiah(Number(c.calculated_subsidy))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashCard>
      </div>
    </>
  );
}
