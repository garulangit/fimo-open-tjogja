import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth";
import { formatRupiah } from "@/lib/branding";
import { CLAIM_STATUS_LABELS, MONTH_NAMES } from "@/lib/claim";

export default async function ClaimReportsPage() {
  await requireContext("claim.reports.view");
  const supabase = await createClient();
  const { data: claims } = await supabase
    .from("claims")
    .select("period_year, period_month, status, total_operational_cost, calculated_subsidy, operator_name")
    .order("period_year", { ascending: false })
    .limit(500);
  const rows = claims ?? [];
  const groups = new Map<string, { count: number; op: number; sub: number }>();
  for (const c of rows) {
    const key = `${c.period_year}-${String(c.period_month).padStart(2, "0")}`;
    const g = groups.get(key) ?? { count: 0, op: 0, sub: 0 };
    g.count++; g.op += Number(c.total_operational_cost); g.sub += Number(c.calculated_subsidy);
    groups.set(key, g);
  }
  const statusCounts = new Map<string, number>();
  for (const c of rows) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Rekap per Periode</h3>
        <table>
          <thead><tr><th>Periode</th><th>Jumlah Klaim</th><th>Total Biaya Operasional</th><th>Total Subsidi Diajukan</th></tr></thead>
          <tbody>
            {[...groups.entries()].map(([key, g]) => {
              const [y, m] = key.split("-");
              return (
                <tr key={key}>
                  <td>{MONTH_NAMES[Number(m) - 1]} {y}</td>
                  <td>{g.count}</td>
                  <td>{formatRupiah(g.op)}</td>
                  <td>{formatRupiah(g.sub)}</td>
                </tr>
              );
            })}
            {groups.size === 0 && <tr><td colSpan={4} className="kpi-note">Belum ada data klaim.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Distribusi Status</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.keys(CLAIM_STATUS_LABELS).map((st) => (
            <span key={st} className="tag" style={{ padding: "6px 12px", fontSize: 13 }}>
              {CLAIM_STATUS_LABELS[st]}: <strong>{statusCounts.get(st) ?? 0}</strong>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
