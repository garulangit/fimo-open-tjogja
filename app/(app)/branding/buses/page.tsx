import Link from "next/link";
import { Bus } from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ConfirmDelete from "@/components/ConfirmDelete";

const OK: Record<string, string> = {
  "bus-dibuat": "Bus ditambahkan.",
  "bus-diubah": "Bus diperbarui.",
  "bus-dihapus": "Bus dihapus.",
};
const ERR: Record<string, string> = {
  izin: "Anda tidak memiliki izin untuk aksi ini.",
  wajib: "No. polisi wajib diisi.",
  duplikat: "No. polisi sudah terdaftar.",
  gagal: "Operasi gagal.",
  "gagal-hapus": "Bus tidak dapat dihapus (masih memiliki booking/foto).",
};

const SORTABLE: Record<string, string> = {
  no_polisi: "No. polisi", route: "Jalur", hull_no: "No Lambung",
  bus_type: "Tipe", color: "Warna", body_maker: "Karoseri",
};

export default async function BusesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; sort?: string; dir?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getSessionContext();
  const canManage = ctx?.permissions.includes("branding.bus.manage") ?? false;
  const supabase = await createClient();
  const sortKey = sp.sort && sp.sort in SORTABLE ? sp.sort : "no_polisi";
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const { data: buses } = await supabase
    .from("branding_buses")
    .select("*")
    .order(sortKey, { ascending: dir === "asc", nullsFirst: false });

  const q = sp.q?.trim().toLowerCase() ?? "";
  const visibleBuses = (buses ?? []).filter((b) => !q || [b.no_polisi, b.fleet_no, b.hull_no, b.route, b.bus_type, b.body_maker, b.color].filter(Boolean).join(" ").toLowerCase().includes(q));
  const sortLink = (key: string) => {
    const nextDir = sortKey === key && dir === "asc" ? "desc" : "asc";
    const arrow = sortKey === key ? (dir === "asc" ? " ↑" : " ↓") : "";
    return (
      <Link className="th-sort" href={`/branding/buses?sort=${key}&dir=${nextDir}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}>
        {SORTABLE[key]}{arrow}
      </Link>
    );
  };

  return (
    <>
      {sp.ok && <div className="alert ok">{OK[sp.ok] ?? "Berhasil."}</div>}
      {sp.error && <div className="alert error">{ERR[sp.error] ?? sp.error}</div>}

      {canManage && (
        <div className="card anim-pop" style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            <Bus size={18} /> Tambah bus
          </h3>
          <form method="post" action="/api/branding/buses">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
              <div><label htmlFor="no_polisi">No. polisi *</label><input id="no_polisi" name="no_polisi" required placeholder="AB 7001 AA" /></div>
              <div><label htmlFor="bus_type">Tipe bus</label><input id="bus_type" name="bus_type" placeholder="Bus Besar" /></div>
              <div><label htmlFor="route">Jalur / koridor</label><input id="route" name="route" /></div>
              <div><label htmlFor="color">Warna</label><input id="color" name="color" /></div>
              <div><label htmlFor="body_maker">Karoseri</label><input id="body_maker" name="body_maker" /></div>
            </div>
            <div style={{ marginTop: 12 }}><button className="btn primary" type="submit">Tambah bus</button></div>
          </form>
        </div>
      )}

      <form method="get" action="/branding/buses" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Cari nopol, nomor lambung, hull, jalur, tipe, karoseri…" style={{ flex: "1 1 280px" }} />
        <button type="submit" className="btn small">Cari</button>
        {sp.q && <Link className="btn small ghost" href="/branding/buses">Reset</Link>}
      </form>
      <div className="card" style={{ padding: 6, overflowX: "auto" }}>
        <table className="mtable">
          <thead>
            <tr>
              <th>No.</th>
              {Object.keys(SORTABLE).map((k) => <th key={k}>{sortLink(k)}</th>)}
              {canManage && <th>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {visibleBuses.map((b, i) => (
              <tr key={b.id}>
                <td className="muted">{i + 1}</td>
                <td className="m-main"><strong>{b.no_polisi}</strong></td>
                <td data-label="Jalur">{b.route ?? "-"}</td>
                <td data-label="No Lambung">{b.hull_no ?? "-"}</td>
                <td data-label="Tipe">{b.bus_type ?? "-"}</td>
                <td data-label="Warna">{b.color ?? "-"}</td>
                <td data-label="Karoseri">{b.body_maker ?? "-"}</td>
                {canManage && (
                  <td className="m-actions">
                    <details className="aksi">
                      <summary className="btn ghost small">Edit / Hapus</summary>
                      <form method="post" action={`/api/branding/buses/${b.id}`} style={{ marginTop: 8, minWidth: 260 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <input name="bus_type" defaultValue={b.bus_type ?? ""} placeholder="Tipe bus" />
                          <input name="route" defaultValue={b.route ?? ""} placeholder="Jalur" />
                          <input name="color" defaultValue={b.color ?? ""} placeholder="Warna" />
                          <input name="body_maker" defaultValue={b.body_maker ?? ""} placeholder="Karoseri" />
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button className="btn small" type="submit">Simpan</button>
                        </div>
                      </form>
                      <div style={{ marginTop: 6 }}>
                        <ConfirmDelete action={`/api/branding/buses/${b.id}`} fields={{ _action: "delete" }} label="Hapus bus" message={`Bus ${b.no_polisi} akan dihapus dari master. Bus yang masih memiliki booking tidak dapat dihapus.`} />
                      </div>
                    </details>
                  </td>
                )}
              </tr>
            ))}
            {(buses ?? []).length === 0 && (
              <tr><td colSpan={9} className="muted">Belum ada data bus. Data armada lama dimuat pada fase ETL.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
