"use client";

import { useState } from "react";

function yearRange(year: number) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export default function BrandingPeriodFilter({ start, end, currentYear }: { start: string; end: string; currentYear: number }) {
  const [range, setRange] = useState({ start, end });
  const [error, setError] = useState("");

  const applyRange = (next: { start: string; end: string }) => {
    setRange(next);
    setError("");
    const params = new URLSearchParams(window.location.search);
    params.delete("month");
    params.delete("year");
    params.set("start", next.start);
    params.set("end", next.end);
    window.location.assign(`/branding?${params.toString()}`);
  };

  const chooseYear = (year: number) => applyRange(yearRange(year));
  const isFullYear = range.start === `${range.start.slice(0, 4)}-01-01`
    && range.end === `${range.start.slice(0, 4)}-12-31`;

  return <section className="dash-card period-filter" aria-label="Filter periode dashboard">
    <label>Tahun<select value={isFullYear ? range.start.slice(0, 4) : "custom"} onChange={(event) => {
      if (event.target.value !== "custom") chooseYear(Number(event.target.value));
    }}>
      {!isFullYear && <option value="custom">Rentang custom</option>}
      {Array.from({ length: 11 }, (_, index) => currentYear - 5 + index).map((year) => <option key={year} value={year}>{year}</option>)}
    </select></label>
    <label>Dari tanggal<input type="date" value={range.start} max={range.end} onChange={(event) => {
      const next = { ...range, start: event.target.value };
      setRange(next);
      if (next.start && next.end && next.start > next.end) {
        setError("Tanggal awal harus sebelum tanggal akhir.");
      } else if (next.start && next.end) applyRange(next);
    }} /></label>
    <label>Sampai tanggal<input type="date" value={range.end} min={range.start} onChange={(event) => {
      const next = { ...range, end: event.target.value };
      setRange(next);
      if (next.start && next.end && next.start > next.end) {
        setError("Tanggal akhir harus setelah tanggal awal.");
      } else if (next.start && next.end) applyRange(next);
    }} /></label>
    {error && <span className="period-filter-error" role="alert">{error}</span>}
  </section>;
}
