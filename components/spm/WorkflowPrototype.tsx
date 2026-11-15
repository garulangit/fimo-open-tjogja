"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PENALTY_DOC_STATUSES, formatDurationMin, operatorForFleet, type SpmFinding, type SpmRate } from "@/lib/spm";
import { OPERATORS } from "./spm-data";

type Dataset = { name: string; source: string; imported: string; rows: string[][]; rawText: string; errors: string[]; duplicates: number };
type Batch = { id: string; source: string; operator_name: string | null; file_name: string; row_count: number; inserted_count: number; duplicate_count: number; error_count: number; created_at: string };
type Penalty = { id: string; findingId: string; code: string; amount: number; basis: string; operator: string; docStatus: string; date: string; fleet: string; sourceRef: string };

function parseCsv(text: string) {
  const out: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '"' && quoted && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = !quoted; else if (c === "," && !quoted) { row.push(cell); cell = ""; } else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); if (row.some((x) => x.trim())) out.push(row); row = []; cell = ""; } else cell += c; }
  if (cell || row.length) { row.push(cell); out.push(row); } return out;
}
const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const MAP_TARGETS = ["Tanggal kejadian", "Nomor lambung", "Waktu kejadian", "Jenis pelanggaran", "Nomor referensi", "Bukti / keterangan", "Jam berhenti", "Jam jalan"] as const;

function extractDate(cell: string): string {
  const m = cell.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const dmy = cell.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return "";
}
function extractTime(cell: string): string {
  const m = cell.match(/\d{2}:\d{2}/);
  return m ? m[0] : "";
}

function downloadExampleCsv(source: "Dishub" | "Operator", operator: string) {
  const headers = source === "Dishub"
    ? ["id_laporan", "tanggal_jam", "nomor_lambung", "kode_pelanggaran", "uraian", "bukti_referensi", "jam_berhenti", "jam_jalan"]
    : ["operator", "nomor_rekonsiliasi", "tanggal_kejadian", "waktu_kejadian", "nomor_lambung", "kode_pelanggaran", "hasil_rekonsiliasi", "keterangan", "jam_berhenti", "jam_jalan"];
  const sample = source === "Dishub"
    ? ["CONTOH-001", "2026-10-04", "A001", "OP-005", "CONTOH - GANTI DENGAN DATA ASLI", "REF-001", "08:00", "11:30"]
    : [operator, "CONTOH-OP-001", "2026-10-04", "08:30", "A001", "OP-005", "CONTOH", "GANTI DENGAN DATA ASLI", "08:10", "09:05"];
  const csv = [headers, sample].map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = source === "Dishub" ? "contoh-import-dishub.csv" : `contoh-rekonsiliasi-${operator.toLowerCase().replaceAll(" ", "-")}.csv`; link.click(); URL.revokeObjectURL(url);
}

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  return r.json();
}

export function ReconciliationPrototype() {
  const [findings, setFindings] = useState<SpmFinding[]>([]);
  const [fq, setFq] = useState("");
  const [fMonth, setFMonth] = useState("");
  const months = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of findings) { const m = f.date.slice(0, 7); counts.set(m, (counts.get(m) ?? 0) + 1); }
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [findings]);
  const visibleFindings = findings.filter((f) => {
    if (fMonth && !f.date.startsWith(fMonth)) return false;
    const needle = fq.trim().toLowerCase();
    if (!needle) return true;
    return [f.fleet, f.type, f.status, f.operator, f.sourceCode].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });
  const [rates, setRates] = useState<SpmRate[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchSize, setBatchSize] = useState("10");
  const [batchPage, setBatchPage] = useState(0);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [source, setSource] = useState<"Dishub" | "Operator">("Dishub");
  const [operator, setOperator] = useState<string>(OPERATORS[0]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [f, r, b] = await Promise.all([
      fetchJson("/api/spm/findings"), fetchJson("/api/spm/rates"), fetchJson("/api/spm/batches"),
    ]);
    setFindings(f.findings ?? []);
    setRates(r.rates ?? []);
    setBatches(b.batches ?? []);
    setExplanations(Object.fromEntries((f.findings ?? []).map((x: SpmFinding) => [x.id, x.explanation])));
  }, []);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const rateFor = (code: string) => rates.find((x) => x.kode_pelanggaran === code);

  async function load(file?: File) {
    if (!file) return;
    const rawText = await file.text(); const rows = parseCsv(rawText);
    if (rows.length < 2) { setMessage("CSV kosong atau hanya berisi header."); return; }
    const headers = rows[0]; const errors: string[] = [];
    if (headers.some((h) => !h.trim())) errors.push("Header memiliki nama kolom kosong.");
    if (new Set(headers.map((h) => h.trim().toLowerCase())).size !== headers.length) errors.push("Header memiliki nama kolom duplikat.");
    rows.slice(1).forEach((r, i) => { if (r.length !== headers.length) errors.push(`Baris ${i + 2}: jumlah kolom berbeda dari header.`); });
    const keys = rows.slice(1).map((r) => r.join("|").toLowerCase()); const duplicates = keys.length - new Set(keys).size;
    setDataset({ name: file.name, source: source === "Dishub" ? "Dishub Monitoring" : `Rekonsiliasi ${operator}`, imported: new Date().toLocaleString("id-ID"), rows, rawText, errors, duplicates });
    const guess: Record<string, string> = {};
    for (const h of headers) {
      const low = h.trim().toLowerCase();
      if (/tanggal|date/.test(low)) guess[h] = "Tanggal kejadian";
      else if (/berhenti|stop/.test(low)) guess[h] = "Jam berhenti";
      else if (/jalan|resume|lanjut/.test(low)) guess[h] = "Jam jalan";
      else if (/lambung|armada|fleet|bus/.test(low)) guess[h] = "Nomor lambung";
      else if (/waktu|jam|time/.test(low)) guess[h] = "Waktu kejadian";
      else if (/pelanggaran|kode|code|jenis/.test(low)) guess[h] = "Jenis pelanggaran";
      else if (/id_laporan|referensi|ref|nomor_rekonsiliasi/.test(low)) guess[h] = "Nomor referensi";
      else if (/uraian|bukti|keterangan|hasil/.test(low)) guess[h] = "Bukti / keterangan";
      else guess[h] = "";
    }
    setMap(guess);
    setMessage(`${rows.length - 1} baris dibaca · ${errors.length} masalah struktur · ${duplicates} baris duplikat identik di dalam file. Atur pemetaan kolom, lalu simpan ke database.`);
  }

  async function saveToDb() {
    if (!dataset) return;
    const headers = dataset.rows[0];
    const colFor = (target: string) => headers.findIndex((h) => map[h] === target);
    const iDate = colFor("Tanggal kejadian"), iFleet = colFor("Nomor lambung"), iTime = colFor("Waktu kejadian"),
      iCode = colFor("Jenis pelanggaran"), iRef = colFor("Nomor referensi"), iEvidence = colFor("Bukti / keterangan"),
      iStop = colFor("Jam berhenti"), iResume = colFor("Jam jalan");
    if (iDate < 0 || iFleet < 0 || iCode < 0) { setMessage("Pemetaan wajib: Tanggal kejadian, Nomor lambung, Jenis pelanggaran."); return; }
    const rows = dataset.rows.slice(1).map((r) => ({
      sourceRef: iRef >= 0 ? r[iRef]?.trim() : "",
      date: extractDate(r[iDate] ?? ""),
      time: iTime >= 0 ? extractTime(r[iTime] ?? "") : extractTime(r[iDate] ?? ""),
      fleet: r[iFleet]?.trim(),
      code: r[iCode]?.trim(),
      evidence: iEvidence >= 0 ? r[iEvidence]?.trim() : "",
      stopAt: iStop >= 0 ? extractTime(r[iStop] ?? "") : "",
      resumeAt: iResume >= 0 ? extractTime(r[iResume] ?? "") : "",
    }));
    setSaving(true);
    try {
      const res = await fetchJson("/api/spm/findings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: source === "Dishub" ? "DISHUB" : "OPERATOR", operatorName: operator, fileName: dataset.name, rawCsv: dataset.rawText, rows }),
      });
      if (res.error) { setMessage(`Gagal menyimpan: ${res.error}. Pastikan akun Anda punya akses tulis SPM.`); return; }
      setMessage(source === "Dishub"
        ? `Tersimpan: ${res.inserted} temuan baru · ${res.duplicates} duplikat ditolak · ${res.errors} baris bermasalah.`
        : `Rekonsiliasi operator tersimpan: ${res.matched} temuan cocok · ${res.clarified ?? 0} klarifikasi diajukan (durasi operator < 3 jam) · ${res.stillViolation ?? 0} tetap pelanggaran · ${res.unmatched} tidak ditemukan pasangannya · ${res.errors} bermasalah.`);
      setDataset(null);
      await refresh();
    } finally { setSaving(false); }
  }

  /** Keputusan manusia: hanya 2 tombol — Disetujui / Disanggah (bukan dropdown).
      Alasan penolakan ditulis di kolom penjelasan; ikut terkirim saat Disanggah. */
  async function decide(id: string, status: "Disetujui" | "Disanggah") {
    setFindings((a) => a.map((x) => (x.id === id ? { ...x, status } : x)));
    await fetchJson(`/api/spm/findings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, explanation: explanations[id] ?? "" }) });
  }
  async function saveExplanation(id: string) {
    await fetchJson(`/api/spm/findings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ explanation: explanations[id] ?? "" }) });
  }

  // Paginasi riwayat berkas: opsi tampil 5/10/25/100/Semua + nomor urut global.
  const batchPageSize = batchSize === "all" ? Math.max(batches.length, 1) : Number(batchSize);
  const batchPageCount = Math.max(1, Math.ceil(batches.length / batchPageSize));
  const safeBatchPage = Math.min(batchPage, batchPageCount - 1);
  const visibleBatches = batches.slice(safeBatchPage * batchPageSize, safeBatchPage * batchPageSize + batchPageSize);

  return <>
    <h1 className="section-title">Rekonsiliasi</h1>
    <p className="subtitle">Perbandingan monitoring Dishub dan laporan operator — tersimpan di database.</p>
    <section className="card spm-panel"><h2>Impor data sumber</h2>
      <div className="spm-filters"><label>Sumber<select value={source} onChange={(e) => setSource(e.target.value as "Dishub" | "Operator")}><option>Dishub</option><option>Operator</option></select></label>{source === "Operator" && <label>Operator<select value={operator} onChange={(e) => setOperator(e.target.value)}>{[...OPERATORS, "Operator C"].map((x) => <option key={x}>{x}</option>)}</select></label>}<label>CSV<input type="file" accept=".csv,text/csv" onChange={(e) => load(e.target.files?.[0])} /></label><button type="button" className="btn ghost" onClick={() => downloadExampleCsv(source, operator)}>Unduh contoh CSV {source}</button></div>
      {message && <p role="status">{message}</p>}
      {dataset && <>
        <p><b>{dataset.source}</b> · {dataset.name} · {dataset.imported} · {dataset.rows.length - 1} baris sumber</p>
        <p>Kolom dikenali dari header, atur pemetaan per sumber:</p>
        <div className="spm-mapping">{Object.keys(map).map((h) => <label key={h}>{h}<select value={map[h]} onChange={(e) => setMap((m) => ({ ...m, [h]: e.target.value }))}><option value="">Tidak dipetakan</option>{MAP_TARGETS.map((x) => <option key={x}>{x}</option>)}</select></label>)}</div>
        {dataset.errors.length > 0 && <div className="spm-banner warn">Validasi: {dataset.errors.slice(0, 5).join(" ")}</div>}
        {dataset.duplicates > 0 && <div className="spm-banner warn">Ditemukan {dataset.duplicates} baris duplikat identik dalam file ini; duplikat akan ditolak database saat disimpan.</div>}
        <div className="table-wrap"><table className="mtable"><tbody>{dataset.rows.slice(0, 9).map((r, i) => <tr key={i}>{r.map((v, j) => i === 0 ? <th key={j}>{v}</th> : <td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
        {dataset.rows.length > 9 && <p>Preview menampilkan 8 dari {dataset.rows.length - 1} baris.</p>}
        <p><button className="btn primary" disabled={saving} onClick={saveToDb}>{saving ? "Menyimpan…" : source === "Dishub" ? "Simpan temuan ke database" : "Simpan rekonsiliasi operator"}</button></p>
      </>}
    </section>
    <section className="card spm-panel"><h2>Riwayat berkas tersimpan</h2>
      <div className="spm-filters"><label>Tampilkan<select value={batchSize} onChange={(e) => { setBatchSize(e.target.value); setBatchPage(0); }}><option value="5">5</option><option value="10">10</option><option value="25">25</option><option value="100">100</option><option value="all">Semua</option></select></label><span className="muted">Menampilkan {visibleBatches.length ? safeBatchPage * batchPageSize + 1 : 0}–{safeBatchPage * batchPageSize + visibleBatches.length} dari {batches.length} berkas</span>{batchPageCount > 1 && <><button type="button" className="btn ghost" disabled={safeBatchPage === 0} onClick={() => setBatchPage(safeBatchPage - 1)}>‹ Sebelumnya</button><span className="muted">Halaman {safeBatchPage + 1} dari {batchPageCount}</span><button type="button" className="btn ghost" disabled={safeBatchPage >= batchPageCount - 1} onClick={() => setBatchPage(safeBatchPage + 1)}>Berikutnya ›</button></>}</div>
      <div className="table-wrap"><table className="mtable"><thead><tr><th>No</th><th>Sumber</th><th>Nama file</th><th>Waktu impor</th><th>Baris sumber</th><th>Masuk</th><th>Duplikat</th><th>Masalah</th></tr></thead><tbody>{visibleBatches.map((b, i) => <tr key={b.id}><td>{safeBatchPage * batchPageSize + i + 1}</td><td>{b.source === "DISHUB" ? "Dishub Monitoring" : `Rekonsiliasi ${b.operator_name ?? "Operator"}`}</td><td>{b.file_name}</td><td>{new Date(b.created_at).toLocaleString("id-ID")}</td><td>{b.row_count}</td><td>{b.inserted_count}</td><td>{b.duplicate_count}</td><td>{b.error_count}</td></tr>)}{!batches.length && <tr><td colSpan={8}>Belum ada berkas tersimpan.</td></tr>}</tbody></table></div></section>
    <section className="card spm-panel"><h2>Perbandingan temuan</h2><div className="spm-filters"><label>Bulan<select value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">Semua bulan ({findings.length})</option>{months.map(([m, n]) => <option key={m} value={m}>{m} ({n})</option>)}</select></label><input placeholder="Filter: nomor lambung, kode, status…" value={fq} onChange={(e) => setFq(e.target.value)} style={{ maxWidth: 300 }} /><span className="muted">Menampilkan {visibleFindings.length} dari {findings.length} temuan</span></div><div className="table-wrap"><table className="mtable"><thead><tr><th>Dishub · Ref</th><th>Operator · Armada</th><th>Jenis / tarif master</th><th>Bukti Dishub</th><th>Bukti operator</th><th>Durasi berhenti · Dishub / Operator</th><th>Status · Keputusan</th><th>Penjelasan</th></tr></thead><tbody>{visibleFindings.map((r) => <tr key={r.id}><td>{r.sourceCode}<br />{r.date}</td><td>{r.operator} · {r.fleet}<br /><small>{operatorForFleet(r.fleet)}</small></td><td>{r.type}<br />{rateFor(r.type)?.basis_pengenaan}<br />{idr(Number(rateFor(r.type)?.amount) || 0)}</td><td>{r.dishub}</td><td>{r.operatorData}</td><td>{r.type === "OP-006" ? <>{formatDurationMin(r.dishubDurationMin)}<br /><small>Operator: {formatDurationMin(r.operatorDurationMin)}</small></> : "—"}</td><td><span>{r.status}</span><div style={{ display: "flex", gap: 6, marginTop: 6 }}><button type="button" className="btn" disabled={r.status === "Disetujui"} onClick={() => decide(r.id, "Disetujui")}>Disetujui</button><button type="button" className="btn" disabled={r.status === "Disanggah"} onClick={() => decide(r.id, "Disanggah")}>Disanggah</button></div></td><td><input aria-label={`Penjelasan ${r.id}`} value={explanations[r.id] ?? ""} placeholder="Catatan rekonsiliasi" onChange={(e) => setExplanations((a) => ({ ...a, [r.id]: e.target.value }))} onBlur={() => saveExplanation(r.id)} /></td></tr>)}{findings.length > 0 && !visibleFindings.length && <tr><td colSpan={8}>Tidak ada temuan yang cocok dengan filter.</td></tr>}{!findings.length && <tr><td colSpan={8}>Belum ada temuan tersimpan. Impor CSV Dishub untuk memulai.</td></tr>}</tbody></table></div><p className="muted">Status dan penjelasan tersimpan otomatis. OP-006 dengan durasi operator &lt; 3 jam otomatis menjadi Klarifikasi Diajukan (gugur dari penetapan). Baris yang tidak memenuhi unsur dinyatakan Rejected (GUGUR). Hanya baris Disetujui yang dapat masuk penetapan denda.</p></section>
  </>;
}

export function PenaltiesPrototype() {
  const [findings, setFindings] = useState<SpmFinding[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [rates, setRates] = useState<SpmRate[]>([]);
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    const [f, p, r] = await Promise.all([fetchJson("/api/spm/findings"), fetchJson("/api/spm/penalties"), fetchJson("/api/spm/rates")]);
    setFindings(f.findings ?? []); setPenalties(p.penalties ?? []); setRates(r.rates ?? []);
  }, []);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const rateFor = (code: string) => rates.find((x) => x.kode_pelanggaran === code);
  const verifiedRows = findings.filter((r) => r.status === "Disetujui" && r.date.startsWith(period));
  const unmapped = verifiedRows.filter((r) => operatorForFleet(r.fleet) === "Belum terklasifikasi");
  const yearPenalties = penalties.filter((p) => p.date.startsWith(period));
  const penalizedIds = new Set(yearPenalties.map((p) => p.findingId));
  const pendingCount = verifiedRows.filter((r) => operatorForFleet(r.fleet) !== "Belum terklasifikasi" && !penalizedIds.has(r.id)).length;

  const summary = useMemo(() => {
    const byCode = new Map<string, { code: string; count: number; total: number }>();
    for (const p of yearPenalties) {
      const cur = byCode.get(p.code) ?? { code: p.code, count: 0, total: 0 };
      cur.count++; cur.total += p.amount; byCode.set(p.code, cur);
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [yearPenalties]);
  const countFor = (code: string, op: string) => yearPenalties.filter((p) => p.code === code && (op === "OUTSOURCING" ? p.operator === "Operator C" : p.operator === op)).length;

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetchJson("/api/spm/penalties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: period }) });
      if (res.error) { setMessage(`Gagal membuat penetapan: ${res.error}. Pastikan akun Anda punya akses tulis SPM.`); return; }
      setMessage(`Penetapan dibuat: ${res.created} snapshot baru · ${res.skippedExisting} sudah ada · ${res.skippedNoRate} dilewati (tarif belum ada nominal).`);
      await refresh();
    } finally { setGenerating(false); }
  }
  async function setDocStatus(id: string, docStatus: string) {
    setPenalties((a) => a.map((x) => (x.id === id ? { ...x, docStatus } : x)));
    await fetchJson(`/api/spm/penalties/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docStatus }) });
  }
  function exportSummary() {
    const body = [["kode", "pelanggaran", "tarif_rp", "basis", "jumlah", "total"], ...summary.map((s) => { const rate = rateFor(s.code); return [s.code, rate?.deskripsi_pelanggaran ?? "", String(rate?.amount ?? ""), rate?.basis_pengenaan ?? "", String(s.count), String(s.total)]; })].map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", body], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `denda-spm-${period}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <>
    <h1 className="section-title">Denda</h1>
    <p className="subtitle">Penetapan denda dari hasil rekonsiliasi yang disetujui — snapshot tarif tersimpan permanen.</p>
    <label className="spm-filters">Tahun<input type="number" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
    {unmapped.length > 0 && <div className="spm-banner warn">{unmapped.length} temuan Disetujui belum dapat ditetapkan karena prefix armadanya belum terklasifikasi.</div>}
    {message && <p role="status">{message}</p>}
    <p><button className="btn primary" disabled={generating || pendingCount === 0} onClick={generate}>{generating ? "Membuat…" : `Buat penetapan dari Disetujui terpetakan (${pendingCount})`}</button> · {yearPenalties.length} snapshot tersimpan <button className="btn ghost" onClick={() => window.print()}>Cetak ringkasan</button> <button className="btn ghost" onClick={exportSummary}>Ekspor CSV</button></p>
    <section className="card spm-panel"><h2>Ringkasan global per jenis pelanggaran</h2><div className="table-wrap"><table className="mtable"><thead><tr><th>Jenis pelanggaran</th><th>Besaran dari master</th><th>Basis pengenaan</th><th>Jumlah</th><th>Total</th></tr></thead><tbody>{summary.map((s) => { const rate = rateFor(s.code); return <tr key={s.code}><td>{s.code} · {rate?.deskripsi_pelanggaran}</td><td>{idr(Number(rate?.amount) || 0)}</td><td>{rate?.basis_pengenaan}</td><td>{s.count}</td><td>{idr(s.total)}</td></tr>; })}{!summary.length && <tr><td colSpan={5}>Belum ada penetapan pada periode ini.</td></tr>}</tbody></table></div><p className="muted">Nominal snapshot memakai kuantitas temuan (bawaan 1 unit pengenaan); basis seperti per lokasi/hari/item dapat diatur lewat kuantitas temuan sebelum penetapan.</p></section>
    <section className="card spm-panel"><h2>Rincian per operator · hitungan insiden</h2><div className="table-wrap"><table className="mtable"><thead><tr><th>Jenis</th><th>Tarif/basis</th><th>Operator A</th><th>Operator B</th><th>Operator C / outsourcing</th><th>Total insiden</th><th>Nominal</th></tr></thead><tbody>{summary.map((s) => { const rate = rateFor(s.code); return <tr key={s.code}><td>{s.code}</td><td>{idr(Number(rate?.amount) || 0)} · {rate?.basis_pengenaan}</td><td>{countFor(s.code, "Operator A")}</td><td>{countFor(s.code, "Operator B")}</td><td>{countFor(s.code, "OUTSOURCING")}</td><td>{s.count}</td><td>{idr(s.total)}</td></tr>; })}{!summary.length && <tr><td colSpan={7}>Belum ada penetapan pada periode ini.</td></tr>}</tbody></table></div></section>
    <section className="card spm-panel spm-report"><h2>Detail penetapan & snapshot tarif</h2><div className="table-wrap"><table className="mtable"><thead><tr><th>Ref rekonsiliasi</th><th>Tanggal / armada</th><th>Operator terpetakan</th><th>Kode pelanggaran</th><th>Nominal snapshot</th><th>Basis</th><th>Status dokumen</th></tr></thead><tbody>{yearPenalties.map((p) => <tr key={p.id}><td>{p.sourceRef}</td><td>{p.date} · {p.fleet}</td><td>{p.operator}</td><td>{p.code}</td><td>{idr(p.amount)}</td><td>{p.basis}</td><td><select aria-label={`Status dokumen ${p.id}`} value={p.docStatus} onChange={(e) => setDocStatus(p.id, e.target.value)}>{PENALTY_DOC_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td></tr>)}{!yearPenalties.length && <tr><td colSpan={7}>Belum ada snapshot penetapan. Klik tombol buat penetapan setelah ada temuan Disetujui.</td></tr>}</tbody></table></div><p className="muted">Snapshot tidak berubah saat master tarif berubah. Berita Acara per operator dicetak dari ringkasan ini.</p></section>
  </>;
}
