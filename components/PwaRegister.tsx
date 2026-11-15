"use client";

import { useEffect } from "react";

/** Daftarkan service worker PWA (statis saja — lihat public/sw.js). */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA gagal daftar tidak boleh mengganggu aplikasi */
      });
    }
  }, []);
  return null;
}
