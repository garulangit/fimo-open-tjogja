"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";

const STORAGE_KEY = "fimo-agent-fab-pos";
const SIZE = 56;
const MARGIN = 8;

interface Pos {
  left: number;
  top: number;
}

function clamp(pos: Pos): Pos {
  const maxLeft = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
  const maxTop = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
  return {
    left: Math.min(Math.max(MARGIN, pos.left), maxLeft),
    top: Math.min(Math.max(MARGIN, pos.top), maxTop),
  };
}

/**
 * Tombol melayang FIMO Agent — tampil di semua layar (mobile & desktop)
 * untuk akun yang punya akses modul Agent. Bisa digeser ke posisi mana pun
 * (pointer mouse/sentuh), posisi terakhir diingat di localStorage. Ketukan
 * tanpa geser membuka halaman Agent. Komponen ini sengaja ringan: satu
 * tombol, tanpa library tambahan.
 */
export default function AgentFab({ show }: { show: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [pos, setPos] = useState<Pos | null>(null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // Pulihkan posisi tersimpan; jaga tetap di dalam layar saat resize.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPos(clamp(JSON.parse(raw) as Pos));
    } catch {
      /* abaikan */
    }
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!show) return null;
  if (path === "/agent" || path.startsWith("/agent/")) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clamp({ left: e.clientX - d.dx, top: e.clientY - d.dy });
    if (!d.moved) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (Math.abs(next.left - rect.left) + Math.abs(next.top - rect.top) < 5) return;
      d.moved = true;
    }
    setPos(next);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      suppressClick.current = true;
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
          } catch {
            /* abaikan */
          }
        }
        return p;
      });
    }
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    router.push("/agent");
  };

  return (
    <button
      type="button"
      className="agent-fab"
      style={pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined}
      aria-label="Buka FIMO Agent"
      title="FIMO Agent — ketuk untuk membuka, seret untuk memindah"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
    >
      <Bot size={26} strokeWidth={2.1} />
    </button>
  );
}
