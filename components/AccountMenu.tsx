"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";

function initials(name: string): string {
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/**
 * Menu akun di kanan atas header: nama + identitas pengguna.
 * Ganti Password & Keluar tinggal di dalam dropdown ini (revisi 1.0.1 B.3),
 * tidak lagi tampil permanen di sidebar.
 */
export default function AccountMenu({
  displayName,
  username,
  roles,
}: {
  displayName: string;
  username: string;
  roles: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="avatar-static">{initials(displayName || username)}</span>
        <span className="account-meta">
          <span className="account-name">{displayName}</span>
          <span className="account-uname">@{username}</span>
        </span>
        <ChevronDown size={15} className={`chev ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-dd-head">
            <div className="account-name">{displayName}</div>
            <div className="account-uname">@{username}</div>
            <div className="chips" style={{ margin: "8px 0 0" }}>
              {roles.map((r) => (
                <span key={r} className="chip">{r}</span>
              ))}
            </div>
          </div>
          <Link href="/change-password" className="account-dd-item" role="menuitem" onClick={() => setOpen(false)}>
            <KeyRound size={15} /> Ganti Password
          </Link>
          <form method="post" action="/api/auth/logout">
            <button type="submit" className="account-dd-item danger" role="menuitem">
              <LogOut size={15} /> Keluar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
