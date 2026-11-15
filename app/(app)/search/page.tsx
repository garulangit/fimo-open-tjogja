import Link from "next/link";
import { Bus, CalendarRange } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { searchAll, searchBusSpotlight } from "@/lib/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();
  const groups = q.length >= 2 ? await searchAll(supabase, ctx, q) : [];
  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  const spotlight = q.length >= 2 ? await searchBusSpotlight(supabase, ctx, q) : null;

  return (
    <>
      <div className="card anim-pop" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>Pencarian Global</h3>
        <form method="get" action="/search" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Cari nopol, nomor lambung, brand, nomor klaim, kode pelanggaran…"
            style={{ flex: "1 1 280px" }}
            autoFocus
          />
          <button type="submit" className="btn">Cari</button>
        </form>
        {q.length >= 2 && (
          <p className="kpi-note" style={{ marginTop: 10 }}>
            {total > 0
              ? `${total} hasil untuk "${q}" dari modul yang bisa Anda akses.`
              : `Tidak ada hasil untuk "${q}" di modul yang bisa Anda akses.`}
          </p>
        )}
        {q.length === 1 && (
          <p className="kpi-note" style={{ marginTop: 10 }}>Ketik minimal 2 karakter untuk mencari.</p>
        )}
      </div>

      {spotlight && (
        <div className="card anim-pop spotlight-card" style={{ marginBottom: 16 }}>
          <div className="gs-group-label" style={{ padding: 0, marginBottom: 6 }}>Hasil paling relevan — data bus</div>
          <h3 className="section-title" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Bus size={20} /> Bus {spotlight.bus.no_polisi}
          </h3>
          <div className="spotlight-grid">
            <div><span>Nomor lambung</span><strong>{spotlight.bus.fleet_no ?? "—"}</strong></div>
            <div><span>Hull</span><strong>{spotlight.bus.hull_no ?? "—"}</strong></div>
            <div><span>Jalur</span><strong>{spotlight.bus.route ?? "—"}</strong></div>
            <div><span>Tipe</span><strong>{spotlight.bus.bus_type ?? "—"}</strong></div>
            <div><span>Karoseri</span><strong>{spotlight.bus.body_maker ?? "—"}</strong></div>
            <div><span>Warna</span><strong>{spotlight.bus.color ?? "—"}</strong></div>
          </div>
          {spotlight.bookings.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div className="gs-group-label" style={{ padding: 0, marginBottom: 6 }}>Booking bus ini</div>
              {spotlight.bookings.map((b, i) => (
                <Link
                  key={i}
                  href={`/branding/bookings?q=${encodeURIComponent(spotlight.bus.no_polisi)}`}
                  className="search-hit"
                  style={{ display: "block", padding: "8px 10px", borderRadius: 8, textDecoration: "none" }}
                >
                  <CalendarRange size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  <strong>{b.brand_name}</strong>
                  <span className="kpi-note" style={{ marginLeft: 8 }}>
                    {[b.company_name, `${b.start_date} s/d ${b.end_date}`, b.status].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="kpi-note" style={{ marginTop: 10 }}>Bus ini belum memiliki booking.</p>
          )}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} className="card anim-pop" style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>{g.label}</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {g.hits.map((h, i) => (
              <Link
                key={`${g.key}-${i}`}
                href={h.href}
                className="search-hit"
                style={{ display: "block", padding: "8px 10px", borderRadius: 8, textDecoration: "none" }}
              >
                <strong>{h.title}</strong>
                {h.subtitle ? <span className="kpi-note" style={{ marginLeft: 8 }}>{h.subtitle}</span> : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
