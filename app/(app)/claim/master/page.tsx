import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/auth";
import ConfirmDelete from "@/components/ConfirmDelete";

export default async function ClaimMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const ctx = await requireContext("claim.master.view");
  const sp = await searchParams;
  const supabase = await createClient();
  const canManage = ctx.permissions.includes("claim.master.manage");
  const [{ data: vehicles }, { data: regulations }, { data: docTypes }, { data: categories }, { data: requirements }, { data: templates }] = await Promise.all([
    supabase.from("claim_vehicle_types").select("*").order("code"),
    supabase.from("claim_regulation_versions").select("*").order("code"),
    supabase.from("claim_document_types").select("*").order("default_sort_order"),
    supabase.from("claim_cost_categories").select("*").order("code"),
    supabase.from("claim_document_requirements").select("*"),
    supabase.from("claim_letter_templates").select("*"),
  ]);
  const cats = categories ?? [];
  const catLabel = new Map(cats.map((c) => [c.id, `${c.code} ${c.name}`]));
  const docLabel = new Map((docTypes ?? []).map((d) => [d.id, `${d.name} (${d.code})`]));
  const F = (entity: string, children: React.ReactNode) => (
    <form method="post" action="/api/claim/master" className="form-grid" style={{ marginBottom: 10 }}>
      <input type="hidden" name="_entity" value={entity} />
      {children}
      <button className="btn" type="submit">Tambah</button>
    </form>
  );
  const Del = ({ entity, id }: { entity: string; id: string }) => (
    <ConfirmDelete action="/api/claim/master" fields={{ _entity: entity, _action: "delete", id }} triggerClassName="btn secondary" triggerStyle={{ padding: "2px 10px" }} message="Data master ini akan dihapus. Baris yang masih dipakai klaim yang ada akan ditolak oleh database." />
  );

  return (
    <>
      {sp.ok && <div className="notice ok">{sp.ok}</div>}
      {sp.err && <div className="notice err">{sp.err}</div>}
      <p className="kpi-note" style={{ marginTop: 0 }}>Pohon kategori biaya & requirement dokumen di sini adalah master yang dipakai wizard klaim. Data legacy lengkap masuk lewat fase ETL dari dev.db subsiditrack; halaman ini untuk kelola & koreksi manual.</p>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Jenis Kendaraan ({(vehicles ?? []).length})</h3>
        {(vehicles ?? []).map((v) => <p key={v.id} style={{ margin: "4px 0" }}><strong>{v.code}</strong> — {v.name} {canManage && <Del entity="vehicle" id={v.id} />}</p>)}
        {canManage && F("vehicle", <>
          <label>Kode <input name="code" required placeholder="DIESEL" /></label>
          <label>Nama <input name="name" required placeholder="Bus Diesel" /></label>
          <label>Deskripsi <input name="description" /></label>
        </>)}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Versi Regulasi ({(regulations ?? []).length})</h3>
        {(regulations ?? []).map((r) => <p key={r.id} style={{ margin: "4px 0" }}><strong>{r.code}</strong> — {r.title} {canManage && <Del entity="regulation" id={r.id} />}</p>)}
        {canManage && F("regulation", <>
          <label>Kode <input name="code" required placeholder="PERGUB_524_2024" /></label>
          <label>Judul <input name="title" required placeholder="Pergub DIY No 524/KEP/2024" /></label>
          <label>Dasar Hukum <input name="legal_basis" placeholder="Keputusan Gubernur DIY Nomor 524/KEP/2024" /></label>
        </>)}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Tipe Dokumen Bukti ({(docTypes ?? []).length})</h3>
        {(docTypes ?? []).map((d) => <p key={d.id} style={{ margin: "4px 0" }}><strong>{d.code}</strong> — {d.name} {canManage && <Del entity="doctype" id={d.id} />}</p>)}
        {canManage && F("doctype", <>
          <label>Kode <input name="code" required placeholder="INVOICE" /></label>
          <label>Nama <input name="name" required placeholder="Invoice" /></label>
          <label>Urutan <input name="default_sort_order" type="number" defaultValue={1} /></label>
        </>)}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Pohon Kategori Biaya ({cats.length})</h3>
        <table>
          <thead><tr><th>Kode</th><th>Nama</th><th>Tipe</th><th>Level</th><th>Input</th><th></th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td style={{ paddingLeft: 10 + (c.level - 1) * 16 }}>{c.code}</td>
                <td>{c.name}</td>
                <td><span className="tag">{c.category_type}</span></td>
                <td>{c.level}</td>
                <td>{c.is_input ? "Ya" : "-"}</td>
                <td>{canManage && <Del entity="category" id={c.id} />}</td>
              </tr>
            ))}
            {cats.length === 0 && <tr><td colSpan={6} className="kpi-note">Pohon kategori masih kosong — tambahkan manual atau tunggu ETL.</td></tr>}
          </tbody>
        </table>
        {canManage && F("category", <>
          <label>Regulasi
            <select name="regulation_version_id" required>{(regulations ?? []).map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select>
          </label>
          <label>Kendaraan
            <select name="vehicle_type_id" required>{(vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}</select>
          </label>
          <label>Induk (opsional)
            <select name="parent_id"><option value="">— akar —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select>
          </label>
          <label>Kode <input name="code" required placeholder="1.1.2.1" /></label>
          <label>Nama <input name="name" required placeholder="Biaya BBM" /></label>
          <label>Tipe
            <select name="category_type">
              <option value="DIRECT_COST">DIRECT_COST</option>
              <option value="INDIRECT_COST">INDIRECT_COST</option>
              <option value="SUPPORTING_COST">SUPPORTING_COST</option>
              <option value="SUBTOTAL">SUBTOTAL</option>
            </select>
          </label>
          <label>Urutan <input name="sort_order" type="number" defaultValue={0} /></label>
          <label style={{ alignSelf: "end" }}><input type="checkbox" name="is_input" /> Kategori input (bisa diisi nominal)</label>
        </>)}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Requirement Dokumen per Kategori ({(requirements ?? []).length})</h3>
        {(requirements ?? []).map((r) => (
          <p key={r.id} style={{ margin: "4px 0" }}>
            {catLabel.get(r.cost_category_id) ?? "?"} → {docLabel.get(r.document_type_id) ?? "?"} {r.is_mandatory ? "(wajib)" : "(opsional)"}, maks {Math.round(r.max_size_bytes / 1048576)} MB {canManage && <Del entity="requirement" id={r.id} />}
          </p>
        ))}
        {canManage && F("requirement", <>
          <label>Kategori
            <select name="cost_category_id" required>{cats.filter((c) => c.is_input).map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select>
          </label>
          <label>Tipe Dokumen
            <select name="document_type_id" required>{(docTypes ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </label>
          <label>Maks Ukuran (MB) <input name="max_size_mb" type="number" defaultValue={15} /></label>
          <label style={{ alignSelf: "end" }}><input type="checkbox" name="is_mandatory" defaultChecked /> Wajib</label>
        </>)}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Template Surat ({(templates ?? []).length})</h3>
        {(templates ?? []).map((t) => <p key={t.id} style={{ margin: "4px 0" }}><strong>{t.code}</strong> — {t.name} · {t.signatory_name} {t.is_default ? "(default)" : ""} {canManage && <Del entity="template" id={t.id} />}</p>)}
        {canManage && F("template", <>
          <label>Kode <input name="code" required placeholder="SURAT_PENGAJUAN" /></label>
          <label>Nama <input name="name" required placeholder="Surat Pengajuan Subsidi" /></label>
          <label>Judul Kop <input name="header_title" defaultValue="DINAS PERHUBUNGAN DAERAH ISTIMEWA YOGYAKARTA" /></label>
          <label>Subjudul Kop <input name="header_subtitle" defaultValue="PENGAJUAN SUBSIDI OPERASIONAL ANGKUTAN PERKOTAAN TRANS JOGJA" /></label>
          <label>Jabatan Penandatangan <input name="signatory_title" defaultValue="Direktur Utama" /></label>
          <label>Nama Penandatangan <input name="signatory_name" required /></label>
          <label style={{ alignSelf: "end" }}><input type="checkbox" name="is_default" /> Default</label>
        </>)}
      </div>
    </>
  );
}
