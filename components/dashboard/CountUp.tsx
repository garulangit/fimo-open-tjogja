"use client";

// Angka KPI yang menghitung naik saat halaman dibuka — pola animasi dashboard
// legacy (requestAnimationFrame, cubic ease-out ±820 ms, hormati
// prefers-reduced-motion).
import { useEffect, useRef } from "react";

export type CountFormat = "int" | "pct" | "rp" | "rpCompact";

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1e3) return `${(n / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 1 })} rb`;
  return `${Math.round(n)}`;
}

export function formatCount(n: number, format: CountFormat): string {
  if (format === "pct") return `${Math.round(n)}%`;
  if (format === "rp") return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  if (format === "rpCompact") return `Rp ${compact(n)}`;
  return Math.round(n).toLocaleString("id-ID");
}

export default function CountUp({ end, format = "int" }: { end: number; format?: CountFormat }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || end === 0) {
      el.textContent = formatCount(end, format);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 820;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatCount(end * eased, format);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, format]);

  return <span ref={ref}>{formatCount(0, format)}</span>;
}
