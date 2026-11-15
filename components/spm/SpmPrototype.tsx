"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, BadgeCheck, CircleDollarSign, FileCheck2, FileClock, ShieldAlert } from "lucide-react";
import { operatorForFleet, type SpmFinding, type SpmRate } from "@/lib/spm";
import { rateToViolationRate, type ViolationRate } from "./spm-data";

const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

interface PenaltyLite { findingId: string; docStatus: string }

export default function SpmPrototype() {
  const [findings, setFindings] = useState<SpmFinding[]>([]);
  const [rates, setRates] = useState<ViolationRate[]>([]);
  const [penalties, setPenalties] = useState<PenaltyLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [operator, setOperator] = useState("Semua operator");
  const [category, setCategory] = useState("Semua pelanggaran");

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/spm/findings").then((r) => r.json()),
      fetch("/api/spm/rates").then((r) => r.json()),
      fetch("/api/spm/penalties").then((r) => r.json()),
    ]).then(([f, r, p]) => {
      if (!alive) return;
      setFindings(f.findings ?? []);
      setRates(((r.rates ?? []) as SpmRate[]).map(rateToViolationRate));
      setPenalties(p.penalties ?? []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { alive = false; };
  }, []);

  const amountFor = (code: string) => Number(rates.find((r) => r.kode_pelanggaran === code)?.besar_denda_rp) || 0;
  const yearRows = useMemo(() => findings.filter((r) => r.date.startsWith(period) && (operator === "Semua operator" || operatorForFleet(r.fleet) === operator) && (category === "Semua pelanggaran" || r.type === category)), [findings, period, operator, category]);
  const rows = yearRows.filter((r) => r.date.slice(5, 7) === month);
  const approved = rows.filter((r) => r.status === "Disetujui");
  const byRate = rates.filter((r) => r.jenis_data === "OPERASIONAL").map((rate) => ({ rate, count: approved.filter((r) => r.type === rate.kode_pelanggaran).length })).filter((x) => x.count);
  const annual = Array.from({ length: 12 }, (_, i) => {
    const m = `${period}-${String(i + 1).padStart(2, "0")}`;
    const inMonth = findings.filter((r) => r.date.startsWith(m) && r.status === "Disetujui" && (operator === "Semua operator" || operatorForFleet(r.fleet) === operator) && (category === "Semua pelanggaran" || r.type === category));
    return { label: new Date(Number(period), i, 1).toLocaleDateString("id-ID", { month: "short" }), count: inMonth.length, total: inMonth.reduce((sum, r) => sum + amountFor(r.type), 0) };
  });
  const max = Math.max(1, ...annual.map((x) => x.total));
  const total = approved.reduce((sum, r) => sum + amountFor(r.type), 0);
  const finalizedIds = new Set(penalties.filter((p) => p.docStatus === "Finalized").map((p) => p.findingId));
  const doneCount = rows.filter((r) => finalizedIds.has(r.id)).length;
  const kpis: [string, string | number, ReactNode][] = [
    [`Total Denda ${new Date(Number(period), Number(month) - 1, 1).toLocaleDateString("id-ID", { month: "long" })}`, money(total), <CircleDollarSign key="i" />],
    ["Total Denda Tahun Berjalan", money(yearRows.filter((r) => r.status === "Disetujui" && Number(r.date.slice(5, 7)) <= Number(month)).reduce((s, r) => s + amountFor(r.type), 0)), <CircleDollarSign key="i" />],
    ["Total Pelanggaran", rows.length, <AlertTriangle key="i" />],
    ["Total Denda Operator A", money(approved.filter((r) => operatorForFleet(r.fleet) === "Operator A").reduce((s, r) => s + amountFor(r.type), 0)), <CircleDollarSign key="i" />],
    ["Total Denda Operator B", money(approved.filter((r) => operatorForFleet(r.fleet) === "Operator B").reduce((s, r) => s + amountFor(r.type), 0)), <CircleDollarSign key="i" />],
    ["Total Denda Operator C", money(0), <CircleDollarSign key="i" />],
    ["Dokumen Menunggu Proses", rows.filter((r) => r.status !== "Disetujui").length, <FileClock key="i" />],
    ["Dokumen Selesai", doneCount, <FileCheck2 key="i" />],
  ];
  const categories = [...new Set(findings.map((r) => r.type))];
  const anyUnverified = rates.some((r) => r.status_data !== "TERVERIFIKASI");
  return <div className="spm-demo">
    {anyUnverified && <div className="spm-banner"><ShieldAlert size={18} /><span><b>Tarif belum terverifikasi</b> — master tarif berasal dari CSV sumber dan belum diverifikasi ke dokumen resmi. Nominal bersifat indikatif sampai tarif resmi dimasukkan di menu Besaran Denda.</span></div>}
    <div className="spm-filters"><label>Bulan<select value={month} onChange={(e) => setMonth(e.target.value)}>{Array.from({ length: 12 }, (_, i) => { const value = String(i + 1).padStart(2, "0"); return <option key={value} value={value}>{new Date(2000, i, 1).toLocaleDateString("id-ID", { month: "long" })}</option>; })}</select></label><label>Tahun<input type="number" min="2000" max="2100" value={period} onChange={(e) => setPeriod(e.target.value)} /></label><label>Operator<select value={operator} onChange={(e) => setOperator(e.target.value)}>{["Semua operator", "Operator A", "Operator B", "Operator C", "Belum terklasifikasi"].map((x) => <option key={x}>{x}</option>)}</select></label><label>Jenis pelanggaran<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Semua pelanggaran</option>{categories.map((x) => <option key={x}>{x}</option>)}</select></label></div>
    <section className="spm-kpis">{kpis.map(([label, value, icon]) => <article className="card spm-kpi" key={label}><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>)}</section>
    <section className="spm-dashboard-grid"><article className="card spm-panel"><h2>Tren Denda Bulanan</h2><p className="muted">Total temuan Disetujui memakai tarif master saat ini per satu unit pengenaan.</p><div className="spm-bars" role="img" aria-label="Grafik tren denda bulanan">{annual.map((x) => <div className="spm-bar-col" key={x.label} title={`${x.label}: ${money(x.total)} · ${x.count} pelanggaran`}><strong>{x.total ? (x.total >= 1_000_000 ? `${(x.total / 1_000_000).toLocaleString("id-ID")} jt` : `${Math.round(x.total / 1000)} rb`) : "—"}</strong><div className="spm-bar" style={{ height: `${Math.max(4, x.total / max * 100)}%` }} /><small>{x.label}</small></div>)}</div></article>
      <article className="card spm-panel"><h2>Distribusi Kategori <span className="tag">berdasarkan nominal</span></h2>{byRate.length ? <div className="spm-category-list">{byRate.map(({ rate, count }) => <div key={rate.kode_pelanggaran}><span><i />{rate.kode_pelanggaran} · {rate.deskripsi_pelanggaran}</span><b>{money(amountFor(rate.kode_pelanggaran) * count)}</b></div>)}</div> : <p className="muted">Belum ada temuan Disetujui untuk filter ini.</p>}<div className="spm-dashboard-total">Total estimasi · {money(total)}</div></article></section>
    <section className="spm-dashboard-grid"><article className="card spm-panel"><h2>Perbandingan Operator</h2>{["Operator A", "Operator B", "Operator C", "Belum terklasifikasi"].map((name) => { const n = approved.filter((r) => operatorForFleet(r.fleet) === name).reduce((s, r) => s + amountFor(r.type), 0); return <div className="spm-operator-row" key={name}><span>{name}</span><div><i style={{ width: `${total ? Math.max(2, n / total * 100) : 0}%` }} /></div><b>{money(n)}</b></div>; })}</article><article className="card spm-panel"><h2>Status Dokumen</h2>{[["Menunggu Rekonsiliasi", rows.filter((r) => ["Pending Review", "Unmatched"].includes(r.status)).length], ["Menunggu Verifikasi", rows.filter((r) => ["Matched", "Requires Clarification"].includes(r.status)).length], ["Klarifikasi Diajukan", rows.filter((r) => r.status === "Klarifikasi Diajukan").length], ["Menunggu Finalisasi", approved.length], ["Selesai", doneCount], ["Tidak Terbukti", rows.filter((r) => r.status === "Rejected").length], ["Disanggah", rows.filter((r) => r.status === "Disanggah").length]].map(([label, count]) => <div className="spm-status-row" key={String(label)}><span>{label}</span><b>{count}</b></div>)}</article></section>
    <section className="card spm-panel"><h2>Temuan bulan terpilih</h2><div className="table-wrap"><table className="mtable"><thead><tr><th>Tanggal</th><th>Armada</th><th>Operator terpetakan</th><th>Jenis</th><th>Status</th><th>Tarif master</th><th>Sumber</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.date}</td><td>{r.fleet}</td><td>{operatorForFleet(r.fleet)}</td><td>{r.type}</td><td>{r.status}</td><td>{money(amountFor(r.type))}</td><td>{r.sourceCode || "Impor Dishub"}</td></tr>)}{!rows.length && <tr><td colSpan={7}>{loaded ? "Belum ada temuan tersimpan untuk filter ini. Impor CSV Dishub di menu Rekonsiliasi." : "Memuat data…"}</td></tr>}</tbody></table></div><p className="muted"><BadgeCheck size={14} /> Hanya temuan Disetujui yang dapat masuk penetapan di menu Denda.</p></section>
  </div>;
}
