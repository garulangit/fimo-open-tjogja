"use client";

import { useEffect, useState } from "react";
import { LogoIcon } from "@/components/Logo";

const LETTERS = "fimo".split("");

/**
 * Loading screen singkat SETELAH login: hanya tampil bila flag session
 * 'oms-splash' disetel form login (lihat LoginMascots). Animasi: ikon logo
 * pop-in, huruf wordmark muncul berjenjang, tagline memudar; layar menghilang
 * mengikuti selesainya muat halaman (min 750ms, maks 1700ms) lalu fade-out.
 */
export default function Splash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let flag = false;
    try {
      flag = sessionStorage.getItem("oms-splash") === "1";
      if (flag) sessionStorage.removeItem("oms-splash");
    } catch { /* abaikan */ }
    if (!flag) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setShow(true);
    const t0 = Date.now();
    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      const wait = Math.max(0, 750 - (Date.now() - t0));
      window.setTimeout(() => {
        setLeaving(true);
        window.setTimeout(() => setShow(false), 380);
      }, wait);
    };
    if (document.readyState === "complete") hide();
    else window.addEventListener("load", hide, { once: true });
    const cap = window.setTimeout(hide, 1700);
    return () => window.clearTimeout(cap);
  }, []);

  if (!show) return null;
  return (
    <div className={`splash ${leaving ? "leaving" : ""}`} aria-hidden="true">
      <div className="splash-inner">
        <div className="splash-icon"><LogoIcon /></div>
        <div className="splash-word">
          {LETTERS.map((ch, i) => (
            <span key={i} style={{ animationDelay: `${120 + i * 45}ms` }}>{ch}</span>
          ))}
        </div>
        <div className="splash-tag">penghubung setiap cerita</div>
        <div className="splash-bar"><span /></div>
      </div>
    </div>
  );
}
