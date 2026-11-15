"use client";
import { useMemo, useState } from "react";
import { Building2, Cctv, CreditCard, Fuel, Mail, MapPin, MessageCircle, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { APPLICATIONS } from "./catalog";

const fallbackIcons: Record<(typeof APPLICATIONS)[number]["icon"], LucideIcon> = {
  ticketing: CreditCard,
  gps: MapPin,
  fms: Building2,
  cctv: Cctv,
  fuel: Fuel,
  mail: Mail,
  erp: Building2,
  crm: MessageCircle,
};

function ApplicationIcon({ app }: { app: (typeof APPLICATIONS)[number] }) {
  const Icon = fallbackIcons[app.icon];
  const [failed, setFailed] = useState(false);
  const iconUrl = (app as { iconUrl?: string }).iconUrl;
  return <span className={`app-tile-icon${iconUrl && !failed ? " has-image" : ""}`} aria-hidden="true">
    {iconUrl && !failed ? <img src={iconUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Icon size={48} strokeWidth={1.7} />}
  </span>;
}

export default function ApplicationCatalog({ visibleSlugs }: { visibleSlugs?: string[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua kategori");
  const visible = visibleSlugs ? APPLICATIONS.filter((a) => visibleSlugs.includes(a.icon)) : APPLICATIONS;
  const categories = ["Semua kategori", ...new Set(visible.map((a) => a.category))];
  const items = useMemo(() => visible.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()) && (category === "Semua kategori" || a.category === category)), [query, category, visible]);
  return <>
    <div className="workspace-toolbar"><label className="workspace-search"><Search size={18}/><input aria-label="Cari aplikasi" placeholder="Cari aplikasi…" value={query} onChange={(e)=>setQuery(e.target.value)}/></label><select aria-label="Kategori aplikasi" value={category} onChange={(e)=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
    <div className="workspace-grid app-tile-grid">{items.map((a)=> <a className="workspace-card app-tile" href={a.url} target="_blank" rel="noopener noreferrer" key={a.name} aria-label={`${a.name}: ${a.description} (buka di tab baru)`}>
      <ApplicationIcon app={a} /><strong>{a.name}</strong><span className="workspace-description">{a.description}</span>
    </a>)}</div>{items.length===0&&<p className="workspace-empty">Aplikasi tidak ditemukan.</p>}
  </>;
}
