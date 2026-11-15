"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

/**
 * Tombol hapus dengan modal konfirmasi in-app (bukan window.confirm).
 * Modal dirender lewat portal ke <body> (revisi 1.0.1 D.2): overlay selalu
 * menutupi seluruh viewport dan tampil di tengah layar, tidak lagi terikat
 * area konten modul (kontainer ber-transform pada .page-enter sebelumnya
 * menjebak position:fixed di dalam area modul).
 * "Ya, hapus" men-submit form POST yang sama persis seperti sebelumnya.
 */
export default function ConfirmDelete({
  action,
  fields = {},
  label = "Hapus",
  message,
  triggerClassName = "btn danger small",
  triggerStyle,
}: {
  action: string;
  fields?: Record<string, string>;
  label?: string;
  message: string;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);

  return (
    <>
      <button type="button" className={triggerClassName} style={triggerStyle} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && mounted && createPortal(
        <div className="modal-backdrop" onClick={() => setOpen(false)} role="presentation">
          <div className="modal-card" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Konfirmasi hapus">
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span className="modal-icon"><Trash2 size={19} /></span>
              <div>
                <h3 style={{ margin: "0 0 5px", fontSize: 16.5 }}>Hapus data ini?</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{message}</p>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setOpen(false)}>Batal</button>
              <form method="post" action={action}>
                {Object.entries(fields).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
                <button type="submit" className="btn danger">Ya, hapus</button>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
