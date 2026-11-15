import { Tags } from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActivePricing } from "@/lib/branding-server";
import { formatRupiah } from "@/lib/branding";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getSessionContext();
  const canManage = ctx?.permissions.includes("branding.pricing.manage") ?? false;
  const supabase = await createClient();
  const pricing = await getActivePricing(supabase);
  const durations = [1, 3, 6, 12];

  return (
    <>
      {sp.ok && <div className="alert ok">Pricelist versi baru diterbitkan: {sp.ok.replace("pricing-v", "v")}.</div>}
      {sp.error && <div className="alert error">{sp.error === "json" ? "Format JSON entri harga tidak valid." : "Operasi gagal / tidak berizin."}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>
          Pricelist aktif {pricing ? `— versi ${pricing.version}` : ""}
        </h3>
        {pricing ? (
          <>
            <p className="muted small-text">
              PPN: {pricing.ppnEnabled ? `aktif ${pricing.ppnPercent}%` : "nonaktif"}. Harga dalam Rupiah, sebelum PPN.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr><th>Media bus</th><th>Space iklan</th>{durations.map((d) => <th key={d}>{d} bulan</th>)}</tr>
                </thead>
                <tbody>
                  {pricing.entries.map((e, i) => (
                    <tr key={i}>
                      <td>{e.mediaBus}</td>
                      <td>{e.spaceIklan}</td>
                      {durations.map((d) => (
                        <td key={d}>{formatRupiah(e.durations[d] ?? e.durations[String(d)])}</td>
                      ))}
                    </tr>
                  ))}
                  {pricing.entries.length === 0 && (
                    <tr><td colSpan={6} className="muted">Belum ada entri harga pada versi ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">Pricelist belum dikonfigurasi. Terbitkan versi pertama lewat formulir di bawah (atau tunggu ETL dari konfigurasi legacy).</p>
        )}
      </div>

      {canManage && (
        <div className="card anim-pop">
          <h3 className="section-title" style={{ marginTop: 0 }}>
            <Tags size={18} /> Terbitkan versi pricelist baru
          </h3>
          <p className="muted small-text">
            Versi lama tidak berubah (snapshot booking lama tetap utuh). Entri dalam format JSON:
            array objek {"{ mediaBus, spaceIklan, durations: { \"1\": harga, \"3\": harga, \"6\": harga, \"12\": harga } }"}.
          </p>
          <form method="post" action="/api/branding/pricing">
            <div className="field">
              <label htmlFor="entries">Entri harga (JSON)</label>
              <textarea
                id="entries" name="entries" rows={9} required
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--text)", fontFamily: "ui-monospace, monospace", fontSize: 13 }}
                defaultValue={JSON.stringify(pricing?.entries ?? [{ mediaBus: "Bus Besar", spaceIklan: "Full Body", durations: { "1": 0, "3": 0, "6": 0, "12": 0 } }], null, 2)}
              />
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <label htmlFor="ppn_percent">PPN (%)</label>
                <input id="ppn_percent" name="ppn_percent" type="number" step="0.01" defaultValue={pricing?.ppnPercent ?? 11} style={{ width: 110 }} />
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500 }}>
                <input type="checkbox" name="ppn_enabled" defaultChecked={pricing?.ppnEnabled ?? true} style={{ width: "auto" }} /> PPN aktif
              </label>
              <button className="btn primary" type="submit">Terbitkan versi baru</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
