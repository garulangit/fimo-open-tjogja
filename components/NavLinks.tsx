"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AppWindow, Bot, Bus, CalendarRange, Camera, ChevronDown, ClipboardList, FileCheck2, FilePlus2, Files,
  Gauge, LayoutDashboard, ListChecks, Settings2, Tags, Users, Wallet, FolderOpen,
} from "lucide-react";

export interface ModuleItem {
  code: string;
  name: string;
  enabled: boolean;
}

interface SubItem {
  label: string;
  href: string;
  icon: typeof Bus;
  /** Kode fitur (migration 0012) yang mengontrol visibilitas submenu ini. */
  feature: string;
}

/** Penamaan modul resmi (revisi 1.0.1 B.2) — menimpa nama di registry. */
export const MODULE_NAMES: Record<string, string> = {
  branding: "Branding FIMO",
  claim: "Klaim Subsidi",
  photo_stamp: "PhotoStamp",
  spm: "Denda SPM",
  agent: "Agent",
};

export const MODULE_SUBMENUS: Record<string, SubItem[]> = {
  branding: [
    { label: "Overview", href: "/branding", icon: LayoutDashboard, feature: "branding.overview" },
    { label: "Branding", href: "/branding/bookings", icon: CalendarRange, feature: "branding.bookings" },
    { label: "History", href: "/branding/history", icon: ClipboardList, feature: "branding.history" },
    { label: "Bus", href: "/branding/buses", icon: Bus, feature: "branding.buses" },
    { label: "Dokumen", href: "/branding/documents", icon: Files, feature: "branding.documents" },
    { label: "Laporan", href: "/branding/reports", icon: Wallet, feature: "branding.reports" },
  ],
  claim: [
    { label: "Overview", href: "/claim", icon: LayoutDashboard, feature: "claim.overview" },
    { label: "Daftar Klaim", href: "/claim/list", icon: ClipboardList, feature: "claim.list" },
    { label: "Pengajuan", href: "/claim/list", icon: FilePlus2, feature: "claim.create" },
    { label: "Verifikasi", href: "/claim/verify", icon: FileCheck2, feature: "claim.verify" },
    { label: "Laporan", href: "/claim/reports", icon: Wallet, feature: "claim.reports" },
  ],
  spm: [
    { label: "Overview", href: "/spm", icon: LayoutDashboard, feature: "spm.overview" },
    { label: "Rekonsiliasi", href: "/spm/reconciliation", icon: ListChecks, feature: "spm.reconciliation" },
    { label: "Denda", href: "/spm/penalties", icon: Wallet, feature: "spm.penalties" },
  ],
};

const MODULE_ICONS: Record<string, typeof Bus> = {
  branding: Bus,
  claim: ClipboardList,
  spm: Gauge,
  photo_stamp: Camera,
  agent: Bot,
};

const MODULE_ORDER: Record<string, number> = {
  branding: 1,
  claim: 2,
  spm: 3,
  photo_stamp: 4,
  agent: 5,
};

interface SettingItem {
  label: string;
  href: string;
  icon: typeof Bus;
  anyPermission: string[];
  /** Bila diisi, item juga disembunyikan saat fitur modulnya dimatikan. */
  feature?: string;
}

/**
 * Menu Setting (revisi 1.0.1 B.4): HANYA halaman konfigurasi yang sudah
 * berfungsi nyata. System Configuration & konfigurasi yang belum ada
 * halamannya sengaja tidak ditampilkan.
 * Sejak v1.1.8 (keputusan Bos 12 Nov 2026): halaman konfigurasi/reference
 * TIDAK lagi tampil di menu modul — Pricelist, Master Data Klaim, dan
 * Besaran Denda SPM tinggal di sini agar menu modul khusus kerja/input.
 */
const SETTING_ITEMS: SettingItem[] = [
  { label: "Manajemen User", href: "/admin/users", icon: Users, anyPermission: ["platform.users.view"] },
  { label: "Pricelist & Tarif", href: "/branding/pricing", icon: Tags, anyPermission: ["branding.pricing.manage", "branding.dashboard.view"] },
  { label: "Data Bus", href: "/branding/buses", icon: Bus, anyPermission: ["branding.bus.manage", "branding.dashboard.view"] },
  { label: "Master Data Klaim", href: "/claim/master", icon: Settings2, anyPermission: ["claim.master.view"] },
  { label: "Besaran Denda SPM", href: "/spm/rates", icon: Tags, anyPermission: ["spm.view", "spm.manage"], feature: "spm.rates" },
];

const STORAGE_KEY = "oms-nav-open-v1";

export default function NavLinks({
  modules,
  permissions,
  moduleAccess,
  featureAccess,
}: {
  modules: ModuleItem[];
  permissions: string[];
  moduleAccess: Record<string, { read: boolean; write: boolean }>;
  featureAccess: Record<string, boolean>;
}) {
  const canMod = (code: string) => moduleAccess[code]?.read ?? false;
  const visSubs = (code: string) =>
    (MODULE_SUBMENUS[code] ?? []).filter((item) => featureAccess[item.feature] !== false);
  const canWorkspace = canMod("workspace") &&
    (featureAccess["workspace.applications"] !== false || featureAccess["workspace.drive"] !== false);
  const canSpm = canMod("spm") && visSubs("spm").length > 0;
  const anyModuleVisible = modules.some(
    (m) => canMod(m.code) && (m.code === "photo_stamp" || !MODULE_SUBMENUS[m.code] || visSubs(m.code).length > 0),
  );
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/branding" || href === "/claim"
      ? path === href
      : path === href || path.startsWith(href + "/");

  // Grup modul buka-tutup; pilihan tersimpan per browser. Default: semua terbuka.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOpenMap(JSON.parse(raw));
    } catch { /* abaikan */ }
  }, []);
  // Modul yang memuat rute aktif selalu terbuka.
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const [code, subs] of Object.entries(MODULE_SUBMENUS)) {
        if (subs.some((s) => isActive(s.href)) && next[code] === false) {
          next[code] = true;
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const toggle = (code: string) =>
    setOpenMap((prev) => {
      const next = { ...prev, [code]: !(prev[code] ?? true) };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
      return next;
    });

  const has = (perms: string[]) => perms.some((p) => permissions.includes(p));
  const settingItems = SETTING_ITEMS.filter(
    (s) => has(s.anyPermission) && (!s.feature || featureAccess[s.feature] !== false),
  );
  const spmOpen = openMap.spm ?? true;
  const orderedModules = [...modules].sort((a, b) => (MODULE_ORDER[a.code] ?? 99) - (MODULE_ORDER[b.code] ?? 99));

  return (
    <>
      {/* 1. DASHBOARD */}
      <Link className={`nav-item ${path === "/" ? "active" : ""}`} href="/">
        <LayoutDashboard size={18} /> Dashboard
      </Link>

      {/* 2. MODUL */}
      {canWorkspace && <><div className="nav-label">Workspace</div>
      {featureAccess["workspace.applications"] !== false && <Link className={`nav-item ${isActive("/workspace/applications") ? "active" : ""}`} href="/workspace/applications"><AppWindow size={18}/> Application Hub</Link>}
      {featureAccess["workspace.drive"] !== false && <Link className={`nav-item ${isActive("/workspace/drive") ? "active" : ""}`} href="/workspace/drive"><FolderOpen size={18}/> Work Drive</Link>}</>}
      {anyModuleVisible && <div className="nav-label">Modul</div>}
      {orderedModules.map((m) => {
        const Icon = MODULE_ICONS[m.code] ?? Bus;
        const name = MODULE_NAMES[m.code] ?? m.name;

        if (m.code === "spm") return null;

        // PhotoStamp: navigasi langsung tanpa dropdown (revisi 1.0.1 B.2).
        if (m.code === "photo_stamp") {
          return (
            <div key={m.code}>
              {canSpm && (
                <div>
                  <button type="button" className="nav-group-toggle" onClick={() => toggle("spm")} aria-expanded={spmOpen}>
                    <Gauge size={18} />
                    <span style={{ flex: 1, textAlign: "left" }}>{MODULE_NAMES.spm}</span>
                    <ChevronDown size={14} className={`chev ${spmOpen ? "open" : ""}`} />
                  </button>
                  <div className={`nav-submenu ${spmOpen ? "is-open" : ""}`} aria-hidden={!spmOpen} inert={!spmOpen}>
                    <div className="nav-submenu-inner">
                      {visSubs("spm").map((item) => {
                        const SubIcon = item.icon;
                        return <Link key={item.href} className={`nav-item sub ${isActive(item.href) ? "active" : ""}`} href={item.href}><SubIcon size={16} /> {item.label}</Link>;
                      })}
                    </div>
                  </div>
                </div>
              )}
              {canMod("photo_stamp") && (
                <Link className={`nav-item ${isActive("/photo-stamp") ? "active" : ""}`} href="/photo-stamp">
                  <Icon size={18} /> {name}
                </Link>
              )}
            </div>
          );
        }

        // Agent: tautan langsung ke halaman chat, tanpa submenu (v1.2.0).
        if (m.code === "agent") {
          if (!canMod("agent") || !m.enabled) return null;
          return (
            <Link key={m.code} className={`nav-item ${isActive("/agent") ? "active" : ""}`} href="/agent">
              <Icon size={18} /> {name}
            </Link>
          );
        }

        // Modul registry nonaktif: placeholder hanya untuk akun yang diberi Read.
        if (!canMod(m.code)) return null;
        if (!m.enabled) {
          return (
            <div key={m.code} className="nav-item soon">
              <Icon size={18} /> {name}
              <span className="tag">Segera</span>
            </div>
          );
        }

        if (!canMod(m.code)) return null;
        const subs = visSubs(m.code);
        if (MODULE_SUBMENUS[m.code] && subs.length === 0) return null;
        const open = openMap[m.code] ?? true;
        return (
          <div key={m.code}>
            <button
              type="button"
              className="nav-group-toggle"
              onClick={() => toggle(m.code)}
              aria-expanded={open}
            >
              <Icon size={15} />
              <span style={{ flex: 1, textAlign: "left" }}>{name}</span>
              <ChevronDown size={14} className={`chev ${open ? "open" : ""}`} />
            </button>
            <div
              className={`nav-submenu ${open ? "is-open" : ""}`}
              aria-hidden={!open}
              inert={!open}
            >
              <div className="nav-submenu-inner">
                {subs.length ? (
                  subs.map((s) => {
                    const SIcon = s.icon;
                    return (
                      <Link
                        key={s.label}
                        className={`nav-item sub ${isActive(s.href) ? "active" : ""}`}
                        href={s.href}
                      >
                        <SIcon size={16} /> {s.label}
                      </Link>
                    );
                  })
                ) : (
                  <div className="nav-item sub soon">
                    <ListChecks size={16} /> Menu modul
                    <span className="tag">Segera</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {/* 4. SETTING — hanya fungsi nyata, disesuaikan permission */}
      {settingItems.length > 0 && (
        <>
          <div className="nav-label">Setting</div>
          {settingItems.map((s) => {
            const SIcon = s.icon;
            return (
              <Link
                key={s.href + s.label}
                className={`nav-item ${path === s.href ? "active" : ""}`}
                href={s.href}
              >
                <SIcon size={18} /> {s.label}
              </Link>
            );
          })}
        </>
      )}
    </>
  );
}
