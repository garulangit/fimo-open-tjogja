"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  title: string;
  subtitle?: string;
  href: string;
}
interface Group {
  key: string;
  label: string;
  hits: Hit[];
}

/**
 * Kotak pencarian global di header: mengetik >= 2 karakter memunculkan
 * dropdown saran berisi item terkait + keterangannya (dari /api/search,
 * sadar izin). Klik saran langsung menuju itemnya; Enter membuka
 * halaman hasil lengkap /search.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onChange = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    const needle = value.trim();
    if (needle.length < 2) {
      setGroups([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(needle)}`);
        const json = await res.json();
        setGroups(json.groups ?? []);
        setOpen(true);
      } catch {
        setGroups([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <div className="global-search" ref={boxRef}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) go(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <input
          name="q"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (groups.length) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Cari nopol, brand, klaim…"
          aria-label="Pencarian global"
          autoComplete="off"
        />
      </form>
      {open && q.trim().length >= 2 && (
        <div className="gs-dropdown">
          {loading && <div className="gs-empty">Mencari…</div>}
          {!loading && total === 0 && (
            <div className="gs-empty">Tidak ada saran untuk “{q.trim()}”. Tekan Enter untuk pencarian penuh.</div>
          )}
          {!loading &&
            groups.map((g) => (
              <div key={g.key} className="gs-group">
                <div className="gs-group-label">{g.label}</div>
                {g.hits.slice(0, 5).map((h, i) => (
                  <button key={i} type="button" className="gs-hit" onClick={() => go(h.href)}>
                    <span className="gs-hit-title">{h.title}</span>
                    {h.subtitle && <span className="gs-hit-sub">{h.subtitle}</span>}
                  </button>
                ))}
              </div>
            ))}
          {!loading && total > 0 && (
            <button
              type="button"
              className="gs-all"
              onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
            >
              Lihat semua hasil untuk “{q.trim()}” →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
