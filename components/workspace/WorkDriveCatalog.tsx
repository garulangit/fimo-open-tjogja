"use client";
import { useMemo, useState } from "react";
import { ExternalLink, FileSpreadsheet, FileText, FolderOpen, Search } from "lucide-react";
import { DOCUMENTS } from "./catalog";
export default function WorkDriveCatalog({ visibleSlugs }: { visibleSlugs?: string[] }){
 const visible=visibleSlugs?DOCUMENTS.filter(d=>visibleSlugs.includes(d.slug)):DOCUMENTS;
 const [q,setQ]=useState(""); const [cat,setCat]=useState("Semua kategori"); const [type,setType]=useState("Semua tipe");
 const cats=["Semua kategori",...new Set(visible.map(d=>d.category))]; const types=["Semua tipe",...new Set(visible.map(d=>d.type))];
 const rows=useMemo(()=>visible.filter(d=>d.title.toLowerCase().includes(q.toLowerCase())&&(cat==="Semua kategori"||d.category===cat)&&(type==="Semua tipe"||d.type===type)),[q,cat,type,visible]);
 const icon=(t:string)=>t==="PDF"?<FileText/>:t==="Google Sheets"?<FileSpreadsheet/>:<FolderOpen/>;
 return <><div className="workspace-toolbar"><label className="workspace-search"><Search size={18}/><input placeholder="Cari dokumen…" aria-label="Cari dokumen" value={q} onChange={e=>setQ(e.target.value)}/></label><select aria-label="Filter kategori" value={cat} onChange={e=>setCat(e.target.value)}>{cats.map(x=><option key={x}>{x}</option>)}</select><select aria-label="Filter tipe dokumen" value={type} onChange={e=>setType(e.target.value)}>{types.map(x=><option key={x}>{x}</option>)}</select></div><div className="workspace-grid">{rows.map(d=><a className="workspace-card" href={d.url} target="_blank" rel="noopener noreferrer" key={d.title}><span className="workspace-icon drive-icon">{icon(d.type)}</span><span className="workspace-category">{d.category} · {d.type}</span><strong>{d.title}</strong><span className="workspace-description">{d.description}</span><span className="workspace-open">Buka dokumen <ExternalLink size={15}/></span></a>)}</div>{rows.length===0&&<p className="workspace-empty">Dokumen tidak ditemukan.</p>}<p className="muted small-text">Tautan mengarah ke dokumen eksternal. OMS tidak mengubah isi dokumen.</p></>;
}
