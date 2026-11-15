"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Toggle tema terang/gelap: ikon matahari & bulan dengan transisi
 * putar + pudar yang halus (revisi 1.0.1 B.3). Mekanisme tema tetap:
 * atribut data-theme di <html> + cookie oms-theme.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `oms-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-btn"
      onClick={toggle}
      aria-label="Ganti tema terang / gelap"
      title="Ganti tema terang / gelap"
    >
      <span className={`theme-ico ${theme === "light" ? "show" : ""}`} aria-hidden>
        <Moon size={18} />
      </span>
      <span className={`theme-ico ${theme === "dark" ? "show" : ""}`} aria-hidden>
        <Sun size={18} />
      </span>
    </button>
  );
}
