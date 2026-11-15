import { ClipboardList, FileCheck2, FileX2, ScrollText, Upload } from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DOC_LABELS, DOC_TYPES } from "@/lib/branding";
import ConfirmDelete from "@/components/ConfirmDelete";

const OK: Record<string, string> = {
  "nota-dibuat": "Nota Dinas dibuat.",
  "nota-diubah": "Nota Dinas diperbarui.",
  "nota-final": "Nota Dinas difinalkan (sekarang terkunci).",
  "nota-dihapus": "Nota Dinas dihapus.",
  "record-dibuat": "Record administrasi dibuat.",
  "dokumen-diunggah": "Dokumen diunggah.",
  "dokumen-dihapus": "Dokumen dihapus.",
  "foto-diunggah": "Foto branding diunggah.",
};
const ERR: Record<string, string> = {
  izin: "Anda tidak memiliki izin.",
  wajib: "Field wajib / berkas belum dipilih.",
  duplikat: "Record brand + PT tersebut sudah ada.",
  ukuran: "Ukuran berkas melebihi batas (PKS 2 MB; dokumen lain & foto 500 KB).",
  tipe: "Tipe berkas tidak sesuai (dokumen wajib PDF; foto JPG/PNG).",
  unggah: "Gagal mengunggah ke storage.",
  final: "Nota Dinas FINAL terkunci dan tidak dapat diubah/dihapus.",
  gagal: "Operasi gagal.",
  "gagal-hapus": "Gagal menghapus.",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; msg?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getSessionContext();
  const canManage = ctx?.permissions.includes("branding.documents.manage") ?? false;
  const supabase = await createClient();
  const [{ data: notas }, { data: records }, { data: docs }, { data: bookings }, { data: buses }, { data: photos }] =
    await Promise.all([
      supabase.from("branding_nota_dinas").select("*, branding_bookings(brand_name, reference_no)").order("created_at", { ascending: false }),
      supabase.from("branding_admin_records").select("*").order("brand_name"),
      supabase.from("branding_admin_documents").select("*"),
      supabase.from("branding_bookings").select("id, brand_name, company_name, reference_no, start_date, end_date, branding_buses(no_polisi)").order("start_date", { ascending: false }),
      supabase.from("branding_buses").select("id, no_polisi").order("no_polisi"),
      supabase.from("branding_bus_photos").select("*, branding_buses(no_polisi)").order("uploaded_at", { ascending: false }).limit(30),
    ]);
  const bookingGroups = new Map<string, { booking: NonNullable<typeof bookings>[number]; busCount: number }>();
  for (const booking of bookings ?? []) {
    const key = booking.reference_no ?? booking.id;
    const group = bookingGroups.get(key);
    if (group) group.busCount += 1;
    else bookingGroups.set(key, { booking, busCount: 1 });
  }
  const docOf = (recordId: string, type: string) =>
    (docs ?? []).find((d) => d.record_id === recordId && d.doc_type === type);

  return (
    <>
      {sp.ok && <div className="alert ok">{OK[sp.ok] ?? "Berhasil."}</div>}
      {sp.error && <div className="alert error">{ERR[sp.error] ?? sp.error}{sp.msg ? <div className="small-text">{sp.msg}</div> : null}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          <ScrollText size={18} /> Nota Dinas ke Legal
        </h3>
        {canManage && (
          <form method="post" action="/api/branding/nota" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="n_booking">Booking terkait</label>
              <select id="n_booking" name="booking_id">
                <option value="">— tanpa booking —</option>
                {[...bookingGroups.values()].map(({ booking: b, busCount }) => (
                  <option key={b.id} value={b.id}>
                    {b.reference_no ?? "REF-—"} - {b.company_name ?? b.brand_name} - {b.start_date} s.d. {b.end_date} ({busCount} bus)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="n_skema">Skema pembayaran</label>
              <select id="n_skema" name="skema">
                <option value="SEKALI">1 kali</option>
                <option value="TIGA_TAHAP">3 tahap</option>
              </select>
            </div>
            <div>
              <label htmlFor="n_perihal">Perihal</label>
              <input id="n_perihal" name="perihal" />
            </div>
            <div>
              <label htmlFor="n_ref">No. surat referensi klien</label>
              <input id="n_ref" name="ref_no" placeholder="17/WM/PM/2026" />
            </div>
            <div>
              <label htmlFor="n_refdate">Tanggal surat referensi</label>
              <input id="n_refdate" name="ref_date" type="date" />
            </div>
            <div>
              <label htmlFor="n_refperihal">Perihal surat referensi</label>
              <input id="n_refperihal" name="ref_perihal" placeholder="Persetujuan Syarat dan Kondisi" />
            </div>
            <div>
              <label htmlFor="n_docdate">Tanggal nota dinas</label>
              <input id="n_docdate" name="doc_date" type="date" />
            </div>
            <div>
              <label htmlFor="n_deadline">Batas pembayaran (skema 1x)</label>
              <input id="n_deadline" name="pay_deadline" type="date" />
            </div>
            <div>
              <label htmlFor="n_t1">Batas termin 1 (skema 3 tahap)</label>
              <input id="n_t1" name="termin_1" placeholder="cth. 7 Mei 2026" />
            </div>
            <div>
              <label htmlFor="n_t2">Batas termin 2</label>
              <input id="n_t2" name="termin_2" />
            </div>
            <div>
              <label htmlFor="n_t3">Batas termin 3</label>
              <input id="n_t3" name="termin_3" />
            </div>
            <div>
              <label htmlFor="n_catatan">Catatan</label>
              <input id="n_catatan" name="catatan" />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button className="btn primary" type="submit">Buat Nota Dinas</button>
            </div>
          </form>
        )}
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Nomor</th><th>Booking</th><th>Skema</th><th>Status</th><th>Dokumen</th>{canManage && <th>Aksi</th>}</tr></thead>
            <tbody>
              {(notas ?? []).map((n) => (
                <tr key={n.id}>
                  <td className="small-text">{n.number}</td>
                  <td>
                    {(n.branding_bookings as unknown as { brand_name: string } | null)?.brand_name ?? "-"}
                    {(n.branding_bookings as unknown as { reference_no: string | null } | null)?.reference_no && (
                      <div className="ref-mono muted">{(n.branding_bookings as unknown as { reference_no: string }).reference_no}</div>
                    )}
                  </td>
                  <td>{(n.payment_terms as { skema?: string })?.skema === "TIGA_TAHAP" ? "3 tahap" : "1 kali"}</td>
                  <td><span className={`tag ${n.status === "FINAL" ? "on" : ""}`}>{n.status}</span></td>
                  <td>
                    <a className="btn ghost small" href={`/api/branding/nota/${n.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                  </td>
                  {canManage && (
                    <td>
                      {n.status !== "FINAL" ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <form method="post" action={`/api/branding/nota/${n.id}`}>
                            <input type="hidden" name="_action" value="final" />
                            <button className="btn small" type="submit">Finalkan</button>
                          </form>
                          <ConfirmDelete action={`/api/branding/nota/${n.id}`} fields={{ _action: "delete" }} message={`Nota Dinas ${n.number} (draf) akan dihapus permanen.`} />
                        </div>
                      ) : (
                        <span className="muted small-text">Terkunci</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {(notas ?? []).length === 0 && <tr><td colSpan={6} className="muted">Belum ada Nota Dinas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          <ClipboardList size={18} /> Kelengkapan Administrasi per Klien
        </h3>
        {canManage && (
          <form method="post" action="/api/branding/documents" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <input name="brand_name" placeholder="Nama brand" required style={{ maxWidth: 220 }} />
            <input name="company_name" placeholder="Nama PT" style={{ maxWidth: 220 }} />
            <button className="btn" type="submit">Buat record</button>
          </form>
        )}
        {(records ?? []).map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
            <strong>{r.brand_name}</strong> <span className="muted">{r.company_name}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 8 }}>
              {DOC_TYPES.map((t) => {
                const d = docOf(r.id, t);
                const filled = Boolean(d?.storage_path);
                return (
                  <div key={t} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 13.5 }}>
                      {filled ? <FileCheck2 size={15} color="var(--primary)" /> : <FileX2 size={15} color="var(--muted)" />}
                      {DOC_LABELS[t]}
                    </div>
                    {filled ? (
                      <div className="small-text" style={{ marginTop: 5 }}>
                        <a href={`/api/branding/files?path=${encodeURIComponent(d!.storage_path!)}`} target="_blank" rel="noreferrer">
                          {d!.file_name}
                        </a>
                        {canManage && (
                          <span style={{ marginLeft: 8 }}>
                            <ConfirmDelete action={`/api/branding/documents/${d!.id}`} message={`File ${d!.file_name ?? "dokumen"} akan dihapus dari penyimpanan.`} />
                          </span>
                        )}
                      </div>
                    ) : canManage ? (
                      <form method="post" action="/api/branding/documents" encType="multipart/form-data" style={{ marginTop: 6, display: "flex", gap: 6 }}>
                        <input type="hidden" name="_action" value="upload" />
                        <input type="hidden" name="record_id" value={r.id} />
                        <input type="hidden" name="doc_type" value={t} />
                        <input type="file" name="file" accept="application/pdf" required style={{ fontSize: 12.5 }} />
                        <button className="btn ghost small" type="submit"><Upload size={13} /> Unggah</button>
                      </form>
                    ) : (
                      <div className="muted small-text" style={{ marginTop: 5 }}>Belum diunggah</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {(records ?? []).length === 0 && <p className="muted">Belum ada record administrasi.</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Foto Branding Bus</h3>
        {canManage && (
          <form method="post" action="/api/branding/photos" encType="multipart/form-data" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <select name="bus_id" required style={{ maxWidth: 220 }}>
              <option value="">— pilih bus —</option>
              {(buses ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.no_polisi}</option>
              ))}
            </select>
            <input type="file" name="file" accept="image/jpeg,image/png" required style={{ maxWidth: 260 }} />
            <button className="btn" type="submit">Unggah foto</button>
          </form>
        )}
        {(photos ?? []).length === 0 ? (
          <p className="muted">Belum ada foto.</p>
        ) : (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {(photos ?? []).map((p) => (
              <div key={p.id} className="small-text">
                <a href={`/api/branding/files?path=${encodeURIComponent(p.storage_path)}`} target="_blank" rel="noreferrer">
                  {p.file_name}
                </a>
                <div className="muted">{(p.branding_buses as unknown as { no_polisi: string } | null)?.no_polisi ?? ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
