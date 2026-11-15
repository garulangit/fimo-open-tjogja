"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

/**
 * Navigasi mobile: tombol hamburger di header + backdrop.
 * Sidebar desktop menjadi drawer lewat kelas `nav-open` di <body>
 * (aturan CSS max-width 860px di globals.css). Menutup otomatis saat
 * berpindah halaman atau saat tautan di dalam sidebar diketuk.
 */
export default function MobileNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.body.classList.remove("nav-open");
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".sidebar a")) {
        document.body.classList.remove("nav-open");
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Gesture swipe (konsep owner 10 Nov 2026): sapuan dari tepi kiri membuka
  // drawer mengikuti jari, sapuan ke kiri menutupnya. Tombol hamburger tetap
  // menjadi jalur utama; gesture ini pelengkap ala aplikasi native.
  useEffect(() => {
    const EDGE = 24; // zona tangkap tepi kiri (px) — sempit agar tidak rebutan gesture back Android
    const WIDTH = 278; // lebar drawer sesuai CSS
    let mode: "open" | "close" | null = null;
    let decided = false;
    let startX = 0;
    let startY = 0;
    let progress = 0;

    const sidebar = () => document.querySelector<HTMLElement>(".sidebar");
    const backdrop = () => document.querySelector<HTMLElement>(".nav-backdrop");
    const isMobile = () => window.matchMedia("(max-width: 860px)").matches;

    const paint = (p: number) => {
      const sb = sidebar();
      const bd = backdrop();
      if (sb) sb.style.transform = `translateX(${(-106 + p * 106).toFixed(2)}%)`;
      if (bd) bd.style.opacity = p.toFixed(3);
    };
    const reset = () => {
      const sb = sidebar();
      const bd = backdrop();
      if (sb) sb.style.transform = "";
      if (bd) bd.style.opacity = "";
      document.body.classList.remove("nav-dragging");
      mode = null;
      decided = false;
    };

    const onStart = (e: TouchEvent) => {
      if (!isMobile() || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      decided = false;
      const open = document.body.classList.contains("nav-open");
      if (!open && startX <= EDGE) {
        mode = "open";
        progress = 0;
      } else if (open && (e.target as HTMLElement).closest(".sidebar, .nav-backdrop, .nav-close")) {
        mode = "close";
        progress = 1;
      } else {
        mode = null;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!mode) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!decided) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          mode = null; // gerakan dominan vertikal = scroll, bukan swipe drawer
          return;
        }
        if (Math.abs(dx) < 8) return;
        decided = true;
        document.body.classList.add("nav-dragging");
      }
      e.preventDefault();
      progress =
        mode === "open"
          ? Math.min(1, Math.max(0, dx / WIDTH))
          : Math.min(1, Math.max(0, 1 + dx / WIDTH));
      paint(progress);
    };
    const onEnd = () => {
      if (!mode) return;
      if (decided) {
        const shouldOpen = mode === "open" ? progress > 0.35 : progress > 0.65;
        document.body.classList.toggle("nav-open", shouldOpen);
      }
      reset();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-label="Buka menu navigasi"
        onClick={() => document.body.classList.toggle("nav-open")}
      >
        <span />
        <span />
        <span />
      </button>
      <div
        className="nav-backdrop"
        aria-hidden="true"
        onClick={() => document.body.classList.remove("nav-open")}
      />
      {mounted &&
        createPortal(
          <button
            type="button"
            className="nav-close"
            aria-label="Tutup menu navigasi"
            onClick={() => document.body.classList.remove("nav-open")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </button>,
          document.body,
        )}
    </>
  );
}
