"use client";

import { Fragment, useState } from "react";
import { effectiveStatus, formatRupiah, PLACEMENTS } from "@/lib/branding";
import ConfirmDelete from "@/components/ConfirmDelete";
import OverrideTotalModal from "@/components/dashboard/OverrideTotalModal";
import type { TotalAdjustment } from "@/lib/branding-adjust";
import BrandingLetterDownload from "@/components/dashboard/BrandingLetterDownload";

export interface BrandingTransactionRow {
  id: string;
  bus_id: string;
  transaction_id?: string;
  reference_no: string | null;
  brand_name: string;
  company_name: string | null;
  placement: string;
  start_date: string;
  end_date: string;
  booking_date?: string | null;
  status: string;
  notes?: string | null;
  pricing_snapshot: { basePrice?: number; ppn?: number; totalWithPpn?: number } | null;
  bus_no_polisi_snapshot?: string | null;
  bus_fleet_no_snapshot?: string | null;
  bus_hull_no_snapshot?: string | null;
  bus_route_snapshot?: string | null;
  bus_type_snapshot?: string | null;
  bus_snapshot_at?: string | null;
  branding_buses: { id: string; no_polisi: string; fleet_no?: string | null; hull_no: string | null; route?: string | null; bus_type?: string | null } | null;
}

export interface BrandingBusOption {
  id: string;
  no_polisi: string;
  hull_no: string | null;
  bus_type: string | null;
  route: string | null;
}

const STATUSES = ["BOOKING", "PROSES", "BERJALAN", "SELESAI"];

export default function BrandingTransactionTable({
  rows, buses, canManage, history = false, adjustments = {}, canOverride = false,
}: {
  rows: BrandingTransactionRow[];
  buses: BrandingBusOption[];
  canManage: boolean;
  history?: boolean;
  adjustments?: Record<string, TotalAdjustment>;
  canOverride?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [overrideKey, setOverrideKey] = useState<string | null>(null);
  const groups = new Map<string, BrandingTransactionRow[]>();
  for (const row of rows) {
    const key = row.transaction_id || row.reference_no || ("TANPA-REFERENSI-" + row.id);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const grouped = [...groups.entries()].map(([key, members]) => {
    const first = members[0];
    const attributes = new Set(members.map((row) =>
      [row.company_name?.trim().toLocaleLowerCase("id-ID") ?? "", row.brand_name.trim().toLocaleLowerCase("id-ID"), row.start_date, row.end_date].join("|"),
    ));
    const statuses = new Set(members.map((row) => effectiveStatus(row.status, row.end_date)));
    const status = [...statuses].every((value) => value === "SELESAI")
      ? "SELESAI" : statuses.size === 1 ? [...statuses][0] : "BERAGAM";
    return {
      key, transactionId: first.transaction_id, members, attributes, status, hasCompletedMember: statuses.has("SELESAI"),
      total: members.reduce((sum, row) => sum + Number(row.pricing_snapshot?.totalWithPpn ?? 0), 0),
      totalBuses: new Set(members.map((row) => row.bus_id)).size,
      placements: [...new Set(members.map((row) => PLACEMENTS[row.placement as keyof typeof PLACEMENTS] ?? row.placement))],
      first,
    };
  });

  return <div className="card table-scroll branding-transaction-table" style={{ padding: 6 }}>
    <table className="mtable">
      <thead><tr><th>Nomor Referensi Brand</th><th>Total Bus</th><th>Penempatan</th><th>Periode</th><th>Status</th><th>Total (PPN)</th><th>Surat</th><th>Aksi</th></tr></thead>
      <tbody>
        {grouped.map((group) => <Fragment key={group.key}>
          <tr>
            <td className="m-main"><strong className="ref-mono">{group.first.reference_no ?? "Tanpa referensi"}</strong>
              <div className="muted small-text">{group.first.brand_name}{group.first.company_name ? " · " + group.first.company_name : ""}</div>
              {group.attributes.size > 1 && <span className="tag">Atribut referensi konflik</span>}
            </td>
            <td data-label="Total Bus">{group.totalBuses}</td>
            <td data-label="Penempatan">{group.placements.length === 1 ? group.placements[0] : "Beragam: " + group.placements.join(", ")}</td>
            <td data-label="Periode" className="small-text">{group.attributes.size === 1 ? group.first.start_date + " → " + group.first.end_date : "Periksa detail"}</td>
            <td data-label="Status"><span className={"tag " + (group.status !== "SELESAI" && group.status !== "BERAGAM" ? "on" : "")}>{group.status}</span></td>
            <td data-label="Total (PPN)">{formatRupiah(group.total)}
              {(() => { const adj = adjustments[group.key]; if (!adj) return null; const orig = adj.ratio !== 0 ? group.total / adj.ratio : group.total; const pctv = (adj.ratio - 1) * 100; return <div className="muted small-text">dari {formatRupiah(orig)} · <span className="tag on">Nego {pctv > 0 ? "+" : ""}{pctv.toFixed(1).replace(".", ",")}%</span></div>; })()}
            </td>
            <td data-label="Surat"><div className="branding-reference-global-actions">
              {group.transactionId ? <>
                <BrandingLetterDownload transactionId={group.transactionId} kind="penawaran" />
                <BrandingLetterDownload transactionId={group.transactionId} kind="konfirmasi" />
              </> : <span className="muted small-text">—</span>}
            </div></td>
            <td className="m-actions"><div className="branding-reference-global-actions">
              <button className="btn ghost small" type="button" aria-expanded={expanded === group.key} onClick={() => setExpanded(expanded === group.key ? null : group.key)}>
                {expanded === group.key ? "Tutup" : `Detail (${group.totalBuses} bus)`}
              </button>
              {canOverride && !history && <button className="btn ghost small" type="button" onClick={() => setOverrideKey(group.key)}>
                {adjustments[group.key] ? "Ubah Nego" : "Override Total"}
              </button>}
              {canManage && !history && group.transactionId && !group.hasCompletedMember && <form method="post" action={`/api/branding/references/${group.transactionId}`} className="inline-form">
                <select name="status" aria-label={`Status referensi ${group.first.reference_no ?? ""}`} defaultValue={STATUSES.some((value) => value === group.status) ? group.status : "PROSES"}>
                  {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <button className="btn ghost small" type="submit">Terapkan ke semua bus</button>
              </form>}
            </div></td>
          </tr>
          {expanded === group.key && <tr key={`${group.key}-detail`} className="branding-reference-expanded-row m-detail">
            <td colSpan={8}><div className="branding-reference-members">
              {group.members.map((row) => {
                const hasSnapshot = Boolean(row.bus_snapshot_at);
                const noPolisi = hasSnapshot ? row.bus_no_polisi_snapshot : row.bus_no_polisi_snapshot ?? row.branding_buses?.no_polisi;
                const fleetNo = hasSnapshot ? row.bus_fleet_no_snapshot : row.bus_fleet_no_snapshot ?? row.branding_buses?.fleet_no;
                const hullNo = hasSnapshot ? row.bus_hull_no_snapshot : row.bus_hull_no_snapshot ?? row.branding_buses?.hull_no;
                const route = hasSnapshot ? row.bus_route_snapshot : row.bus_route_snapshot ?? row.branding_buses?.route;
                const busType = hasSnapshot ? row.bus_type_snapshot : row.bus_type_snapshot ?? row.branding_buses?.bus_type;
                return <section className="branding-reference-member" key={row.id}>
                  <div className="branding-reference-bus">
                    <strong>{noPolisi || (hasSnapshot ? "—" : "Bus tidak ditemukan")}</strong>
                    <span>Nomor armada: {fleetNo || "—"}</span><span>Lambung: {hullNo || "—"}</span>
                    <span>Jalur: {route || "—"}</span><span>Tipe: {busType || "—"}</span>
                    <span>Company: {row.company_name || "Tidak tercatat"}</span><span>Brand: {row.brand_name}</span>
                    <span>Penempatan: {PLACEMENTS[row.placement as keyof typeof PLACEMENTS] ?? row.placement}</span>
                    <span>Periode: {row.start_date} → {row.end_date}</span><span>Status operasional: Belum tercatat</span>
                    <span>Status branding: {effectiveStatus(row.status, row.end_date)}</span>
                  </div>
                  {canManage && !history && effectiveStatus(row.status, row.end_date) !== "SELESAI" && <div className="branding-reference-actions">
                    <details>
                      <summary className="small-text" style={{ cursor: "pointer" }}>Edit lengkap</summary>
                      <form method="post" action={`/api/branding/bookings/${row.id}`} style={{ marginTop: 8 }}>
                        <div className="branding-member-edit-grid">
                          <select name="bus_id" defaultValue={row.branding_buses?.id ?? ""} required>{buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.no_polisi}</option>)}</select>
                          <select name="placement" defaultValue={row.placement}>{Object.entries(PLACEMENTS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
                          <input name="brand_name" defaultValue={row.brand_name} required />
                          <input name="company_name" defaultValue={row.company_name ?? ""} placeholder="Nama PT" />
                          <input name="booking_date" type="date" defaultValue={row.booking_date ?? ""} />
                          <input name="start_date" type="date" defaultValue={row.start_date} required />
                          <input name="end_date" type="date" defaultValue={row.end_date} required />
                          <input name="notes" defaultValue={row.notes ?? ""} placeholder="Keterangan" />
                        </div>
                        <button className="btn small" type="submit" style={{ marginTop: 8 }}>Simpan perubahan</button>
                      </form>
                    </details>
                    <ConfirmDelete action={`/api/branding/bookings/${row.id}`} fields={{ _action: "delete" }} message={`Booking ${row.brand_name} di bus ${noPolisi ?? ""} akan dihapus permanen dari daftar.`} />
                  </div>}
                </section>;
              })}
            </div></td>
          </tr>}
        </Fragment>)}
        {grouped.length === 0 && <tr className="m-empty"><td colSpan={8} className="muted">{history ? "Belum ada history branding." : "Belum ada transaksi branding."}</td></tr>}
      </tbody>
    </table>
    {overrideKey && (() => {
      const g = grouped.find((x) => x.key === overrideKey);
      if (!g) return null;
      const adj = adjustments[overrideKey] ?? null;
      const original = adj && adj.ratio !== 0 ? g.total / adj.ratio : g.total;
      return (
        <OverrideTotalModal
          groupKey={overrideKey}
          label={`${g.first.reference_no ?? "Tanpa referensi"} · ${g.first.brand_name}${g.first.company_name ? " · " + g.first.company_name : ""}`}
          originalTotal={Math.round(original)}
          active={adj}
          onClose={() => setOverrideKey(null)}
        />
      );
    })()}
  </div>;
}
