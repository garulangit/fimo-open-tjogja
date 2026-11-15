"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppWindow, Bus, ClipboardList, Gauge, Home, X } from "lucide-react";
import { MODULE_NAMES, MODULE_SUBMENUS, type ModuleItem } from "./NavLinks";

/**
 * Bottom tab bar ala aplikasi native — hanya tampil di layar mobile
 * (≤860px, aturan CSS .bottom-nav di globals.css).
 *
 * Perilaku (konsep owner 10 Nov 2026): tab modul TIDAK langsung berpindah
 * halaman — ketukan membuka sheet berisi menu modul itu (isi yang sama
 * dengan submenu sidebar) dalam bentuk TILE; ketuk tile untuk masuk.
 * Home dan App (Application Hub) adalah halaman tunggal → langsung pindah.
 * Visibilitas mengikuti sidebar: Branding/Klaim dari registry modul,
 * SPM + Application Hub khusus superadmin.
 */
export default function BottomNav({
  modules,
  moduleAccess,
  featureAccess,
}: {
  modules: ModuleItem[];
  moduleAccess: Record<string, { read: boolean; write: boolean }>;
  featureAccess: Record<string, boolean>;
}) {
  const canMod = (code: string) => moduleAccess[code]?.read ?? false;
  const canSpm = canMod("spm");
  const canWorkspace = canMod("workspace") && featureAccess["workspace.applications"] !== false;
  const path = usePathname();
  const [openModule, setOpenModule] = useState<string | null>(null);

  // Sheet selalu tertutup setelah berpindah halaman.
  useEffect(() => {
    setOpenModule(null);
  }, [path]);

  const enabled = (code: string) => modules.some((m) => m.code === code && m.enabled);
  const under = (href: string) => path === href || path.startsWith(href + "/");

  const moduleTabs = [
    { code: "branding", label: "Branding", href: "/branding", icon: Bus, show: enabled("branding") && canMod("branding") },
    { code: "claim", label: "Klaim", href: "/claim", icon: ClipboardList, show: enabled("claim") && canMod("claim") },
    { code: "spm", label: "SPM", href: "/spm", icon: Gauge, show: canSpm },
  ].filter((t) => t.show && MODULE_SUBMENUS[t.code]);

  const openItems = openModule
    ? (MODULE_SUBMENUS[openModule] ?? []).filter((item) => featureAccess[item.feature] !== false)
    : null;
  const openTab = moduleTabs.find((t) => t.code === openModule);

  return (
    <>
      {openItems && openTab && (
        <div className="tab-sheet-wrap">
          <div className="tab-sheet-backdrop" aria-hidden="true" onClick={() => setOpenModule(null)} />
          <div className="tab-sheet" role="dialog" aria-label={`Menu ${MODULE_NAMES[openTab.code] ?? openTab.label}`}>
            <div className="tab-sheet-head">
              <span>{MODULE_NAMES[openTab.code] ?? openTab.label}</span>
              <button type="button" aria-label="Tutup menu" onClick={() => setOpenModule(null)}>
                <X size={17} />
              </button>
            </div>
            <div className="tab-sheet-grid">
              {openItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.label} href={item.href} className="tab-tile">
                    <span className="tab-tile-icon">
                      <Icon size={20} />
                    </span>
                    <span className="tab-tile-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Navigasi utama mobile">
        <Link href="/home" className={path === "/home" && !openModule ? "active" : ""} aria-current={path === "/home" ? "page" : undefined}>
          <Home size={21} strokeWidth={path === "/home" ? 2.4 : 2} />
          <span>Home</span>
        </Link>
        {moduleTabs.map((t) => {
          const Icon = t.icon;
          const isActive = under(t.href);
          const isOpen = openModule === t.code;
          return (
            <button
              key={t.code}
              type="button"
              className={isActive || isOpen ? "active" : ""}
              aria-expanded={isOpen}
              onClick={() => setOpenModule(isOpen ? null : t.code)}
            >
              <Icon size={21} strokeWidth={isActive || isOpen ? 2.4 : 2} />
              <span>{t.label}</span>
            </button>
          );
        })}
        {canWorkspace && (
          <Link
            href="/workspace/applications"
            className={under("/workspace") && !openModule ? "active" : ""}
            aria-current={under("/workspace") ? "page" : undefined}
          >
            <AppWindow size={21} strokeWidth={under("/workspace") ? 2.4 : 2} />
            <span>App</span>
          </Link>
        )}
      </nav>
    </>
  );
}
