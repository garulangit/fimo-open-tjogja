import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth";
import { formatRupiah } from "@/lib/branding";
import { CLAIM_STATUS_LABELS, MONTH_NAMES, REVENUE_FORM_ROWS } from "@/lib/claim";
import { loadClaimBundle, validateClaim } from "@/lib/claim-server";
import ConfirmDelete from "@/components/ConfirmDelete";
import ClaimSummaryDownload from "@/components/ClaimSummaryDownload";

const EDITABLE = ["DRAFT", "REVISION_REQUIRED"];

export default async function ClaimDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string; summary?: string }>;
}) {
  const ctx = await requireContext("claim.claim.view");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const bundle = await loadClaimBundle(supabase, id);
  if (!bundle) return <div className="notice err">Klaim tidak ditemukan.</div>;
  const c = bundle.claim;
  const editable = EDITABLE.includes(c.status);
  const can = (p: string) => ctx.permissions.includes(p);

  const [{ data: vehicle }, { data: regulation }, { data: docTypes }, { data: versions }] = await Promise.all([
    supabase.from("claim_vehicle_types").select("name").eq("id", c.vehicle_type_id).single(),
    supabase.from("claim_regulation_versions").select("title").eq("id", c.regulation_version_id).single(),
    supabase.from("claim_document_types").select("id, code, name"),
    supabase.from("claim_versions").select("version_number, revision_reason, created_at").eq("claim_id", id).order("version_number"),
  ]);
  const docTypeName = new Map((docTypes ?? []).map((d) => [d.id, `${d.name} (${d.code})`]));
  const validation = await validateClaim(supabase, id);
  const items = [...bundle.items].sort((a, b) => a.category.code.localeCompare(b.category.code, undefined, { numeric: true }));

  // Verifikasi per item (migration 0017): nilai yang dicairkan disimpan
  // berdampingan dengan usulan. Form hanya tampil saat IN_REVIEW untuk
  // pemegang izin verify; di luar itu hasil verifikasi tampil baca-saja.
  const hasVerified = c.calculated_verified_subsidy !== null && c.calculated_verified_subsidy !== undefined;
  const canVerifyNow = c.status === "IN_REVIEW" && can("claim.claim.verify");
  const verifiedItems = items.filter((it) => Number(it.calculated_total) > 0 || Number(it.verified_amount ?? 0) > 0);
  const tidakCairSubsidi = hasVerified ? Number(c.calculated_subsidy) - Number(c.calculated_verified_subsidy) : 0;

  const totalRows: Array<[string, unknown]> = [
    ["Biaya Langsung", c.total_direct_cost], ["Biaya Tidak Langsung", c.total_indirect_cost],
    ["Biaya Dasar", (c as Record<string, unknown>).total_base_cost], ["Keuntungan", (c as Record<string, unknown>).total_profit],
    ["Biaya Pendukung", c.total_supporting_cost], ["Biaya Operasional", c.total_operational_cost],
    ["Pendapatan", c.total_revenue], ["SUBSIDI", c.calculated_subsidy],
  ];

  return (
    <>
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      {sp.err && <div className="notice err">{sp.err}</div>}
      {sp.summary === "1" && <ClaimSummaryDownload claimId={id} claimNumber={c.claim_number} />}

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>{c.claim_number} <span className="tag">{CLAIM_STATUS_LABELS[c.status]}</span></h3>
            <p className="kpi-note" style={{ margin: 0 }}>
              {c.operator_name} · {MONTH_NAMES[c.period_month - 1]} {c.period_year} · {vehicle?.name} · {regulation?.title} · Versi {c.current_version}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
            <a className="btn secondary" href={`/api/claim/claims/${id}/pdf`} target="_blank" rel="noreferrer">Surat PDF</a>
            {editable && can("claim.claim.delete") && (
              <ConfirmDelete action={`/api/claim/claims/${id}`} fields={{ _action: "delete" }} label="Hapus Klaim" triggerClassName="btn danger" message={`Klaim ${c.claim_number} beserta item, dokumen, dan riwayat versinya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`} />
            )}
            <Link className="btn secondary" href="/claim/list">← Daftar</Link>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 14 }}>
          {totalRows.map(([label, v]) => (
            <div key={label as string} className="kpi" style={{ padding: 12 }}>
              <div className="kpi-label">{label as string}</div>
              <div style={{ fontWeight: label === "SUBSIDI" ? 800 : 600 }}>{formatRupiah(Number(v ?? 0))}</div>
            </div>
          ))}
        </div>
        {hasVerified && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
            <div className="kpi" style={{ padding: 12 }}>
              <div className="kpi-label">Operasional Terverifikasi</div>
              <div style={{ fontWeight: 600 }}>{formatRupiah(Number(c.total_verified_operational_cost ?? 0))}</div>
            </div>
            <div className="kpi" style={{ padding: 12 }}>
              <div className="kpi-label">Subsidi Terverifikasi (Dicairkan)</div>
              <div style={{ fontWeight: 800 }}>{formatRupiah(Number(c.calculated_verified_subsidy ?? 0))}</div>
            </div>
            <div className="kpi" style={{ padding: 12 }}>
              <div className="kpi-label">Tidak Cair</div>
              <div style={{ fontWeight: 600 }}>{formatRupiah(tidakCairSubsidi)}</div>
            </div>
          </div>
        )}
        {hasVerified && c.verified_at && (
          <p className="kpi-note" style={{ marginTop: 8 }}>
            Nilai terverifikasi terakhir disimpan {new Date(c.verified_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB — rincian per item pada kartu Verifikasi di bawah.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Validasi &amp; Kelengkapan</h3>
        <div className="small-text" style={{ fontWeight: 700, marginBottom: 6 }}>
          Syarat Wajib <span className="muted" style={{ fontWeight: 500 }}>— harus terpenuhi agar pengajuan dapat dikirim</span>
        </div>
        {validation.blockingErrors.length === 0 ? (
          <p style={{ color: "var(--ok-text)", fontWeight: 600, margin: "0 0 14px" }}>✓ Terpenuhi — klaim dapat diajukan.</p>
        ) : (
          <ul style={{ margin: "0 0 14px", paddingLeft: 18 }}>
            {validation.blockingErrors.map((e) => <li key={e} style={{ color: "var(--danger)" }}>{e}</li>)}
          </ul>
        )}
        <div className="small-text" style={{ fontWeight: 700, marginBottom: 6 }}>
          Catatan Kelengkapan <span className="muted" style={{ fontWeight: 500 }}>— belum lengkap, tetapi TIDAK menghalangi simpan / pengiriman</span>
        </div>
        {validation.itemIssues.length === 0 && validation.warnings.length === 0 ? (
          <p className="kpi-note" style={{ margin: 0 }}>Tidak ada catatan — seluruh dokumen checklist terunggah.</p>
        ) : (
          <>
            {validation.itemIssues.map((i) => (
              <p key={i.code} className="kpi-note" style={{ margin: "0 0 4px" }}>
                ⚠ <strong>{i.code} {i.name}</strong> — dokumen belum diunggah: {i.missingDocs.join(", ")}
              </p>
            ))}
            {validation.warnings
              .filter((w) => !w.includes("dokumen bukti"))
              .map((w) => <p key={w} className="kpi-note" style={{ margin: "0 0 4px" }}>⚠ {w}</p>)}
          </>
        )}
      </div>

      {editable && can("claim.claim.edit") ? (
        <form className="card" method="post" action={`/api/claim/claims/${id}`} style={{ marginBottom: 18 }}>
          <input type="hidden" name="_action" value="meta" />
          <h3 style={{ marginTop: 0 }}>Data Pengajuan</h3>
          <div className="form-grid">
            <label>Operator <input name="operator_name" defaultValue={c.operator_name} required /></label>
            <label>Nama PIC <input name="pic_name" defaultValue={c.pic_name} required /></label>
            <label>Jabatan PIC <input name="pic_position" defaultValue={c.pic_position} required /></label>
            <label>Profit (%) <input name="profit_percentage" type="number" step="0.01" defaultValue={Number(c.profit_percentage)} /></label>
            <label style={{ gridColumn: "1 / -1" }}>Catatan <input name="notes" defaultValue={c.notes ?? ""} /></label>
          </div>
          <button className="btn" type="submit">Simpan Data</button>
        </form>
      ) : (
        c.notes ? <div className="card" style={{ marginBottom: 18 }}><h3 style={{ marginTop: 0 }}>Catatan</h3><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{c.notes}</p></div> : null
      )}

      <form className="card" method="post" action={`/api/claim/claims/${id}`} style={{ marginBottom: 18 }}>
        <input type="hidden" name="_action" value="items" />
        <h3 style={{ marginTop: 0 }}>Komponen Biaya</h3>
        <table>
          <thead><tr><th>Kode</th><th>Komponen</th><th>Tipe</th><th>Nominal Dasar</th><th>Pajak</th><th>Nilai Pajak</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td style={{ paddingLeft: 10 + (it.category.level - 1) * 16 }}>{it.category.code}</td>
                <td>{it.category.name}</td>
                <td><span className="tag">{it.category.category_type.replace("_COST", "")}</span></td>
                <td>
                  {editable && can("claim.claim.edit")
                    ? <input name={`nominal_${it.id}`} type="number" step="any" defaultValue={Number(it.nominal_base)} style={{ width: 140 }} />
                    : formatRupiah(Number(it.nominal_base))}
                </td>
                <td>
                  {editable && can("claim.claim.edit") ? (
                    <span style={{ display: "flex", gap: 4 }}>
                      <select name={`taxtype_${it.id}`} defaultValue={it.tax_type}>
                        <option value="NONE">Tanpa</option>
                        <option value="PPN_11">PPN 11%</option>
                        <option value="CUSTOM">Manual</option>
                      </select>
                      <input name={`taxrate_${it.id}`} type="number" step="0.01" defaultValue={Number(it.tax_rate)} style={{ width: 64 }} title="Tarif manual %" />
                    </span>
                  ) : it.tax_type}
                </td>
                <td>{formatRupiah(Number(it.calculated_tax))}</td>
                <td>{formatRupiah(Number(it.calculated_total))}</td>
                <td><span className="tag">{it.completion_status}</span></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} className="kpi-note">Belum ada item — pohon kategori untuk kombinasi ini kosong. Isi Master Data dulu.</td></tr>}
          </tbody>
        </table>
        {editable && can("claim.claim.edit") && items.length > 0 && (
          <button className="btn" type="submit" style={{ marginTop: 12 }}>Simpan Item & Hitung Ulang</button>
        )}
      </form>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Dokumen Bukti per Item</h3>
        {items.map((it) => {
          const reqs = bundle.requirements.filter((r) => r.cost_category_id === it.cost_category_id);
          if (reqs.length === 0) return null;
          return (
            <div key={it.id} style={{ marginBottom: 12 }}>
              <strong>{it.category.code} {it.category.name}</strong>
              {reqs.map((r) => {
                const doc = bundle.documents.find(
                  (d) => d.claim_item_id === it.id && d.document_type_id === r.document_type_id && d.storage_path,
                );
                return (
                  <div key={r.document_type_id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                    <span className="tag">{docTypeName.get(r.document_type_id) ?? "Dokumen"}{r.is_mandatory ? " *" : ""}</span>
                    {doc ? (
                      <a href={`/api/claim/files?path=${encodeURIComponent(doc.storage_path!)}`} target="_blank" rel="noreferrer">{doc.original_filename} ✓</a>
                    ) : <span className="kpi-note">belum diunggah (maks {Math.round(r.max_size_bytes / 1048576)} MB, PDF)</span>}
                    {editable && can("claim.claim.edit") && (
                      <form method="post" action={`/api/claim/claims/${id}/documents`} encType="multipart/form-data" style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="claim_item_id" value={it.id} />
                        <input type="hidden" name="document_type_id" value={r.document_type_id} />
                        <input type="file" name="file" accept="application/pdf" required />
                        <button className="btn secondary" type="submit">Unggah</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {bundle.requirements.length === 0 && <p className="kpi-note">Belum ada requirement dokumen pada kategori item klaim ini (atur di Master Data).</p>}
      </div>

      {editable && can("claim.claim.edit") ? (
        <form className="card" method="post" action={`/api/claim/claims/${id}`} style={{ marginBottom: 18 }}>
          <input type="hidden" name="_action" value="revenues" />
          <h3 style={{ marginTop: 0 }}>Pendapatan Operasional</h3>
          {Array.from({ length: REVENUE_FORM_ROWS }).map((_, i) => {
            const rev = bundle.revenues[i];
            return (
              <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
                <label>Kode <input name={`rev_code_${i}`} defaultValue={rev?.revenue_code ?? ""} placeholder="3.1" /></label>
                <label>Nama <input name={`rev_name_${i}`} defaultValue={rev?.revenue_name ?? ""} placeholder="Penerimaan Tiket" /></label>
                <label>Kategori
                  <select name={`rev_cat_${i}`} defaultValue={rev?.category ?? "TICKET"}>
                    <option value="TICKET">Tiket</option>
                    <option value="BRANDING">Branding</option>
                  </select>
                </label>
                <label>Nominal <input name={`rev_nominal_${i}`} type="number" step="any" defaultValue={rev ? Number(rev.nominal) : ""} /></label>
              </div>
            );
          })}
          <button className="btn" type="submit">Simpan Pendapatan</button>
        </form>
      ) : (
        bundle.revenues.length > 0 && (
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 style={{ marginTop: 0 }}>Pendapatan Operasional</h3>
            <table><tbody>
              {bundle.revenues.map((r) => (
                <tr key={r.id}><td>{r.revenue_code}</td><td>{r.revenue_name}</td><td>{r.category}</td><td>{formatRupiah(Number(r.nominal))}</td></tr>
              ))}
            </tbody></table>
          </div>
        )
      )}

      {canVerifyNow ? (
        <form className="card" method="post" action={`/api/claim/claims/${id}`} style={{ marginBottom: 18 }}>
          <input type="hidden" name="_action" value="verified" />
          <h3 style={{ marginTop: 0 }}>Verifikasi per Item — Nilai yang Dicairkan</h3>
          <p className="kpi-note" style={{ marginTop: 0 }}>
            Kolom Verifikasi terisi awal sama dengan Usulan. Turunkan sesuai hasil verifikasi, lalu simpan —
            kolom Tidak Cair dan total terverifikasi dihitung ulang dari nilai yang tersimpan. Nilai Usulan tidak berubah.
          </p>
          <table>
            <thead><tr><th>Kode</th><th>Komponen</th><th>Usulan</th><th>Verifikasi</th><th>Tidak Cair</th></tr></thead>
            <tbody>
              {verifiedItems.map((it) => {
                const ver = Number(it.verified_amount ?? it.calculated_total);
                return (
                  <tr key={it.id}>
                    <td style={{ paddingLeft: 10 + (it.category.level - 1) * 16 }}>{it.category.code}</td>
                    <td>{it.category.name}</td>
                    <td>{formatRupiah(Number(it.calculated_total))}</td>
                    <td><input name={`verified_${it.id}`} type="number" step="any" min="0" defaultValue={ver} style={{ width: 160 }} /></td>
                    <td>{formatRupiah(Number(it.calculated_total) - ver)}</td>
                  </tr>
                );
              })}
              {verifiedItems.length === 0 && <tr><td colSpan={5} className="kpi-note">Tidak ada item biaya terisi pada klaim ini.</td></tr>}
            </tbody>
          </table>
          {bundle.revenues.length > 0 && (
            <>
              <h4 style={{ marginBottom: 6 }}>Pendapatan</h4>
              <table>
                <thead><tr><th>Nama</th><th>Kategori</th><th>Usulan</th><th>Verifikasi</th><th>Tidak Cair</th></tr></thead>
                <tbody>
                  {bundle.revenues.map((r) => {
                    const ver = Number(r.verified_amount ?? r.nominal);
                    return (
                      <tr key={r.id}>
                        <td>{r.revenue_name}</td>
                        <td>{r.category}</td>
                        <td>{formatRupiah(Number(r.nominal))}</td>
                        <td><input name={`verified_rev_${r.id}`} type="number" step="any" min="0" defaultValue={ver} style={{ width: 160 }} /></td>
                        <td>{formatRupiah(Number(r.nominal) - ver)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
          <button className="btn" type="submit" style={{ marginTop: 12 }}>Simpan Nilai Terverifikasi</button>
        </form>
      ) : hasVerified ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Verifikasi per Item — Nilai yang Dicairkan</h3>
          <table>
            <thead><tr><th>Kode</th><th>Komponen</th><th>Usulan</th><th>Verifikasi</th><th>Tidak Cair</th></tr></thead>
            <tbody>
              {verifiedItems.map((it) => {
                const ver = Number(it.verified_amount ?? it.calculated_total);
                return (
                  <tr key={it.id}>
                    <td style={{ paddingLeft: 10 + (it.category.level - 1) * 16 }}>{it.category.code}</td>
                    <td>{it.category.name}</td>
                    <td>{formatRupiah(Number(it.calculated_total))}</td>
                    <td>{formatRupiah(ver)}</td>
                    <td>{formatRupiah(Number(it.calculated_total) - ver)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {bundle.revenues.length > 0 && (
            <>
              <h4 style={{ marginBottom: 6 }}>Pendapatan</h4>
              <table>
                <thead><tr><th>Nama</th><th>Kategori</th><th>Usulan</th><th>Verifikasi</th><th>Tidak Cair</th></tr></thead>
                <tbody>
                  {bundle.revenues.map((r) => {
                    const ver = Number(r.verified_amount ?? r.nominal);
                    return (
                      <tr key={r.id}>
                        <td>{r.revenue_name}</td>
                        <td>{r.category}</td>
                        <td>{formatRupiah(Number(r.nominal))}</td>
                        <td>{formatRupiah(ver)}</td>
                        <td>{formatRupiah(Number(r.nominal) - ver)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Alur Pengajuan</h3>
        {editable && can("claim.claim.submit") && (
          <form method="post" action={`/api/claim/claims/${id}`} style={{ marginBottom: 12 }}>
            <input type="hidden" name="_action" value="submit" />
            {c.status === "REVISION_REQUIRED" && (
              <label style={{ display: "block", marginBottom: 8 }}>Alasan / keterangan revisi
                <input name="revision_reason" style={{ width: "100%" }} placeholder="Revisi diajukan kembali" />
              </label>
            )}
            <button className="btn" type="submit" disabled={validation.blockingErrors.length > 0}>
              {c.status === "REVISION_REQUIRED" ? "Ajukan Ulang Revisi" : "Ajukan untuk Verifikasi"}
            </button>
            {validation.blockingErrors.length > 0 ? (
              <span className="kpi-note" style={{ marginLeft: 10 }}>Perbaiki dulu syarat wajib pada panel Validasi &amp; Kelengkapan.</span>
            ) : validation.itemIssues.length > 0 ? (
              <span className="kpi-note" style={{ marginLeft: 10 }}>
                Pengajuan tetap dapat dikirim — {validation.itemIssues.reduce((s, i) => s + i.missing, 0)} dokumen belum lengkap, tercatat sebagai catatan kelengkapan untuk verifikator.
              </span>
            ) : null}
          </form>
        )}
        {c.status === "IN_REVIEW" && (can("claim.claim.verify") || can("claim.claim.approve")) && (
          <form method="post" action={`/api/claim/claims/${id}`}>
            <input type="hidden" name="_action" value="review" />
            <label style={{ display: "block", marginBottom: 8 }}>Catatan verifikator
              <input name="review_notes" style={{ width: "100%" }} placeholder="Catatan (opsional, ditempel ke klaim)" />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {can("claim.claim.approve") && <button className="btn" type="submit" name="review_action" value="APPROVE">Setujui</button>}
              {can("claim.claim.verify") && <button className="btn secondary" type="submit" name="review_action" value="REQUEST_REVISION">Minta Revisi</button>}
              {can("claim.claim.verify") && <button className="btn secondary" type="submit" name="review_action" value="REJECT">Tolak</button>}
            </div>
          </form>
        )}
        {c.status === "APPROVED" && can("claim.claim.approve") && (
          <form method="post" action={`/api/claim/claims/${id}`}>
            <input type="hidden" name="_action" value="review" />
            <button className="btn" type="submit" name="review_action" value="COMPLETE">Tandai Selesai (COMPLETED)</button>
          </form>
        )}
        {(versions ?? []).length > 0 && (
          <p className="kpi-note" style={{ marginTop: 12 }}>
            Riwayat versi: {(versions ?? []).map((v) => `v${v.version_number} (${v.revision_reason ?? "-"})`).join(" · ")}
          </p>
        )}
      </div>
    </>
  );
}
