"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PLACEMENTS } from "@/lib/branding";

export interface BusOption {
  id: string;
  no_polisi: string;
  hull_no: string | null;
  bus_type: string | null;
  route: string | null;
}

/**
 * Pemilih bus untuk form booking (revisi 1.0.1 C.2): pencarian global
 * (no. polisi / lambung / tipe / jalur) + pilihan ganda via checkbox.
 * Bus dan penempatan tiap anggota dikirim sebagai hidden fields agar pilihan
 * tetap terkirim saat daftar pencarian sedang difilter.
 */
export default function BusPicker({ buses }: { buses: BusOption[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ReadonlyMap<string, string>>(new Map());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return buses;
    return buses.filter((b) =>
      [b.no_polisi, b.hull_no ?? "", b.bus_type ?? "", b.route ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [q, buses]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const placements = new Map(prev);
      if (placements.has(id)) placements.delete(id);
      else placements.set(id, "FULL_BODY");
      return placements;
    });

  return (
    <div className="bus-picker">
      <div className="bus-picker-head">
        <Search size={15} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari bus: no. polisi, no. lambung, tipe, jalur…"
          aria-label="Cari bus"
        />
        <span className="tag on">{selected.size} bus dipilih</span>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => setSelected((prev) => {
            const next = new Map(prev);
            for (const bus of filtered) if (!next.has(bus.id)) next.set(bus.id, "FULL_BODY");
            return next;
          })}
        >
          Pilih semua hasil
        </button>
        <button type="button" className="btn ghost small" onClick={() => setSelected(new Map())}>
          Bersihkan
        </button>
      </div>
      <div className="bus-picker-list">
        {[...selected.entries()].flatMap(([id, placement]) => [
          <input key={"bus-" + id} type="hidden" name="bus_ids" value={id} />,
          <input key={"placement-" + id} type="hidden" name="bus_placements" value={id + ":" + placement} />,
        ])}
        {filtered.map((b) => (
          <div key={b.id} className="bus-opt">
            <label>
              <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} />
              <strong>{b.no_polisi}</strong>
              <span className="muted">
                {[b.hull_no ? `Lambung ${b.hull_no}` : null, b.bus_type, b.route]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </label>
            {selected.has(b.id) && <select
              aria-label={`Penempatan ${b.no_polisi}`}
              value={selected.get(b.id)}
              onChange={(event) => setSelected((prev) => new Map(prev).set(b.id, event.target.value))}
            >
              {Object.entries(PLACEMENTS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="bus-picker-empty">Tidak ada bus yang cocok dengan pencarian.</div>
        )}
      </div>
    </div>
  );
}
