import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth";
import { formatRupiah } from "@/lib/branding";
import { CLAIM_STATUS_LABELS, MONTH_NAMES } from "@/lib/claim";

export default async function ClaimListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; err?: string; q?: string }>;
}) {
  const ctx = await requireContext("claim.claim.view");
  const sp = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("claims")
    .select("id, claim_number, status, period_month, period_year, operator_name, calculated_subsidy, total_operational_cost, current_version")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q?.trim()) {
    const pat = `%${sp.q.trim()}%`;
    query = query.or(`claim_number.ilike.${pat},operator_name.ilike.${pat}`);
  }
  const [{ data: claims }, { data: vehicles }, { data: regulations }] = await Promise.all([
    query,
    supabase.from("claim_vehicle_types").select("id, code, name").eq("active", true),
    supabase.from("claim_regulation_versions").select("id, code, title").eq("active", true),
  ]);
  const canCreate = ctx.permissions.includes("claim.claim.create");
  const now = new Date();

  return (
    <>
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      {sp.err && <div className="notice err">{sp.err}</div>}
      <form method="get" action="/claim/list" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Cari nomor klaim atau operator…" style={{ flex: "1 1 260px" }} />
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button type="submit" className="btn secondary">Cari</button>
        {sp.q && <Link className="btn secondary" href={sp.status ? `/claim/list?status=${sp.status}` : "/claim/list"}>Reset</Link>}
      </form>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Link className="btn secondary" href={sp.q ? `/claim/list?q=${encodeURIComponent(sp.q)}` : "/claim/list"}>Semua</Link>
        {Object.keys(CLAIM_STATUS_LABELS).map((st) => (
          <Link key={st} className="btn secondary" href={`/claim/list?status=${st}`}>{CLAIM_STATUS_LABELS[st]}</Link>
        ))}
      </div>

      {canCreate && (
        <form className="card" method="post" action="/api/claim/claims" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Pengajuan Klaim Baru</h3>
          <div className="form-grid">
            <label>Jenis Kendaraan
              <select name="vehicle_type_id" required defaultValue="">
                <option value="" disabled>Pilih kendaraan</option>
                {(vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
              </select>
            </label>
            <label>Versi Regulasi
              <select name="regulation_version_id" required defaultValue="">
                <option value="" disabled>Pilih regulasi</option>
                {(regulations ?? []).map((r) => <option key={r.id} value={r.id}>{r.title} ({r.code})</option>)}
              </select>
            </label>
            <label>Bulan Periode
              <select name="period_month" defaultValue={now.getMonth() + 1}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label>Tahun Periode
              <input name="period_year" type="number" defaultValue={now.getFullYear()} required />
            </label>
            <label>Operator Angkutan
              <input name="operator_name" required placeholder="PT Jogja Tugu Trans" />
            </label>
            <label>Nama PIC
              <input name="pic_name" placeholder="Nama penanggung jawab" />
            </label>
            <label>Jabatan PIC
              <input name="pic_position" placeholder="Jabatan" />
            </label>
            <label>Profit (%)
              <input name="profit_percentage" type="number" step="0.01" defaultValue={7} />
            </label>
          </div>
          <p className="kpi-note">Item biaya dibuat otomatis dari kategori input pada Master Data untuk kombinasi regulasi + kendaraan ini.</p>
          <button className="btn" type="submit">Buat Klaim</button>
        </form>
      )}

      <div className="card">
        <table className="mtable">
          <thead><tr><th>Nomor</th><th>Operator</th><th>Periode</th><th>Status</th><th>Versi</th><th>Biaya Operasional</th><th>Subsidi</th></tr></thead>
          <tbody>
            {(claims ?? []).map((c) => (
              <tr key={c.id}>
                <td className="m-main"><Link href={`/claim/${c.id}`}>{c.claim_number}</Link></td>
                <td data-label="Operator">{c.operator_name}</td>
                <td data-label="Periode">{MONTH_NAMES[c.period_month - 1]} {c.period_year}</td>
                <td data-label="Status"><span className="tag">{CLAIM_STATUS_LABELS[c.status]}</span></td>
                <td data-label="Versi">v{c.current_version}</td>
                <td data-label="Biaya Operasional">{formatRupiah(Number(c.total_operational_cost))}</td>
                <td data-label="Subsidi">{formatRupiah(Number(c.calculated_subsidy))}</td>
              </tr>
            ))}
            {(claims ?? []).length === 0 && (
              <tr className="m-empty"><td colSpan={7} className="kpi-note">Tidak ada klaim pada filter ini.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
