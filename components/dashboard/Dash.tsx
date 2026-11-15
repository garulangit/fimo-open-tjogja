// Komponen dashboard bersama untuk Dashboard Utama, Overview Branding, dan
// Overview Klaim. Pola desain diadaptasi dari Tabler (MIT License,
// https://github.com/tabler/tabler) — grid 12 kolom, kartu KPI, kartu grafik,
// donut + legenda, tabel aktivitas — dan dari dashboard legacy Branding v2.0
// (KPI ringkas horizontal ber-chip ikon berwarna, grafik animasi ease-out
// ±820 ms, gridline + label sumbu). Diimplementasikan ulang native dengan CSS
// vanilla + SVG React; tanpa dependensi baru, tanpa menyalin kode/aset.
import { useId, type CSSProperties, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import CountUp, { type CountFormat } from "./CountUp";

export const TONES: Record<string, string> = {
  green: "#177245",
  blue: "#2563eb",
  amber: "#d97706",
  violet: "#7c3aed",
  teal: "#0e9594",
  red: "#dc2626",
  slate: "#64748b",
};

export function DashCard({
  title,
  sub,
  subtitle,
  action,
  span = 6,
  children,
}: {
  title: string;
  sub?: string;
  subtitle?: string;
  action?: ReactNode;
  span?: 4 | 6 | 8 | 12;
  children: ReactNode;
}) {
  const text = sub ?? subtitle;
  return (
    <section className={`dash-card span-${span}`}>
      <div className="dash-card-head">
        <div>
          <h3>{title}</h3>
          {text && <p>{text}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Sparkline({
  points,
  color = "#177245",
  width = 84,
  height = 26,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, height - 3 - ((p - min) / range) * (height - 6)] as const);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg width={width} height={height} aria-hidden="true" className="spark">
      <polygon points={area} fill={color} opacity={0.12} className="spark-area" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="spark-line"
      />
    </svg>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  num,
  numFormat = "int",
  note,
  spark,
  tone = "green",
  delay = 0,
  span,
}: {
  icon: LucideIcon;
  label: string;
  value?: ReactNode;
  num?: number;
  numFormat?: CountFormat;
  note?: string;
  spark?: number[];
  tone?: keyof typeof TONES;
  delay?: number;
  span?: 4 | 6 | 8 | 12;
}) {
  const color = TONES[tone] ?? TONES.green;
  return (
    <article
      className={`kpi dkpi pop${span ? ` span-${span}` : ""}`}
      style={{ "--tone": color, animationDelay: `${delay}s` } as CSSProperties}
    >
      <div className="kpi-ic">
        <Icon size={17} />
      </div>
      <div className="dkpi-main">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">
          {num !== undefined ? <CountUp end={num} format={numFormat} /> : value}
        </div>
        {note && <div className="kpi-note">{note}</div>}
      </div>
      {spark && (
        <div className="dkpi-spark">
          <Sparkline points={spark} color={color} />
        </div>
      )}
    </article>
  );
}

export interface BarSeries {
  name: string;
  color: string;
  values: number[];
  displays?: string[];
}

function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

export function BarChart({
  labels,
  series,
  height = 176,
  formatTick,
}: {
  labels: string[];
  series: BarSeries[];
  height?: number;
  formatTick?: (n: number) => string;
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const W = 640;
  const H = height;
  const padL = 40;
  const padR = 8;
  const padT = 18;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxV = Math.max(4, ...series.flatMap((s) => s.values));
  const slot = plotW / Math.max(labels.length, 1);
  const groupW = Math.min(slot * 0.6, series.length * 38 + (series.length - 1) * 5);
  const barW = series.length ? groupW / series.length - (series.length > 1 ? 4 : 0) : groupW;
  const ticks = [0, 1, 2, 3, 4].map((i) => (maxV / 4) * i);
  const fmt = formatTick ?? ((n: number) => `${Math.round(n)}`);
  return (
    <div>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`bg${rawId}-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.55} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => {
          const y = padT + plotH - (t / maxV) * plotH;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth={i === 0 ? 1.2 : 0.7} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={8.5} fill="var(--muted)">
                {fmt(t)}
              </text>
            </g>
          );
        })}
        {labels.map((lab, i) => {
          const gx = padL + i * slot + (slot - groupW) / 2;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = Math.max((v / maxV) * plotH, v > 0 ? 3 : 0);
                const x = gx + si * (barW + 4);
                const y = padT + plotH - h;
                return (
                  <g key={si}>
                    {h > 0 && (
                      <path
                        d={barPath(x, y, barW, h, 3.5)}
                        fill={`url(#bg${rawId}-${si})`}
                        className="bar-grow"
                        style={{ animationDelay: `${i * 65 + si * 45}ms` } as CSSProperties}
                      >
                        <title>{`${s.name} — ${lab}: ${s.displays?.[i] ?? v}`}</title>
                      </path>
                    )}
                    {s.displays?.[i] && v > 0 && (
                      <text
                        x={x + barW / 2}
                        y={y - 4}
                        textAnchor="middle"
                        fontSize={8.5}
                        fontWeight={600}
                        fill="var(--muted)"
                        className="bar-val"
                        style={{ animationDelay: `${i * 65 + si * 45 + 250}ms` } as CSSProperties}
                      >
                        {s.displays[i]}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={padL + i * slot + slot / 2} y={H - 5} textAnchor="middle" fontSize={9} fill="var(--muted)">
                {lab}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  data,
  centerValue,
  centerLabel,
  size = 148,
}: {
  data: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const segments = data;
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const parts = segments
    .filter((s) => s.value > 0)
    .map((s, idx) => {
      const frac = total > 0 ? s.value / total : 0;
      const dash = Math.max(frac * C - 2.5, 0.1);
      const offset = -acc * C;
      acc += frac;
      return { ...s, frac, dash, offset, idx };
    });
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" className="donut-svg">
        <circle cx={60} cy={60} r={R} fill="none" stroke="var(--border)" strokeWidth={13} opacity={0.45} />
        {parts.map((p) => (
          <circle
            key={p.label}
            cx={60}
            cy={60}
            r={R}
            fill="none"
            stroke={p.color}
            strokeWidth={13}
            strokeDasharray={`${p.dash} ${C - p.dash}`}
            strokeDashoffset={p.offset}
            transform="rotate(-90 60 60)"
            className="donut-seg"
            style={{ "--dc": C, "--do": p.offset, animationDelay: `${p.idx * 110}ms` } as CSSProperties}
          >
            <title>{`${p.label}: ${p.value} (${Math.round(p.frac * 100)}%)`}</title>
          </circle>
        ))}
        <text x={60} y={59} textAnchor="middle" fontSize={19} fontWeight={700} fill="var(--text)">
          {centerValue}
        </text>
        <text x={60} y={74} textAnchor="middle" fontSize={8.5} fill="var(--muted)">
          {centerLabel}
        </text>
      </svg>
      <ul className="legend">
        {segments.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>
              {s.value} · {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyNote({ text }: { text: string }) {
  return <p className="muted dash-empty">{text}</p>;
}

export const BRANDING_STATUS_COLORS: Record<string, string> = {
  BOOKING: "#d97706",
  PROSES: "#2563eb",
  BERJALAN: "#177245",
  SELESAI: "#64748b",
};

export const CLAIM_STATUS_COLORS: Record<string, string> = {
  DRAFT: "#64748b",
  SUBMITTED: "#2563eb",
  IN_REVIEW: "#d97706",
  REVISION_REQUIRED: "#dc2626",
  APPROVED: "#177245",
  REJECTED: "#7c3aed",
  COMPLETED: "#0e9594",
};
