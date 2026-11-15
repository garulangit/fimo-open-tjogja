import Link from "next/link";
import {
  AppWindow,
  Bot,
  Bus,
  Camera,
  ClipboardList,
  FolderOpen,
  Gauge,
  LayoutDashboard,
} from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Beranda (Home) — pintu masuk ala aplikasi: sapaan + tile modul.
 * Sengaja dibedakan dari Dashboard ("/"): Dashboard adalah overview
 * data eksekutif, Home adalah peluncur modul. Bottom bar mobile dan
 * start_url PWA menunjuk ke sini (konsep owner 10 Nov 2026).
 */
export default async function HomePage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: modules } = await supabase.from("module_registry").select("code, enabled");
  const enabled = (code: string) => (modules ?? []).some((m) => m.code === code && m.enabled);
  const hasBranding = ctx.permissions.some((p) => p.startsWith("branding."));
  const hasClaim = ctx.permissions.some((p) => p.startsWith("claim."));

  const today = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  const tiles = [
    {
      href: "/",
      icon: LayoutDashboard,
      name: "Dashboard",
      desc: "Overview eksekutif lintas modul: KPI, grafik, dan ringkasan terbaru.",
      show: true,
    },
    {
      href: "/branding",
      icon: Bus,
      name: "Branding FIMO",
      desc: "Booking branding, data bus, pricelist, dan laporan pendapatan.",
      show: hasBranding && enabled("branding"),
    },
    {
      href: "/claim",
      icon: ClipboardList,
      name: "Klaim Subsidi",
      desc: "Pengajuan, verifikasi, dan laporan klaim subsidi operasional.",
      show: hasClaim && enabled("claim"),
    },
    {
      href: "/spm",
      icon: Gauge,
      name: "Denda SPM",
      desc: "Rekonsiliasi temuan Dishub dan penetapan denda. (Demo — simulasi)",
      show: ctx.moduleAccess.spm?.read ?? false,
    },
    {
      href: "/agent",
      icon: Bot,
      name: "Agent",
      desc: "Asisten data internal: tanya-jawab dan rekap atas data operasional.",
      show: ctx.permissions.includes("agent.use") && enabled("agent"),
    },
    {
      href: "/photo-stamp",
      icon: Camera,
      name: "PhotoStamp",
      desc: "Stempel tanggal, waktu, dan lokasi pada foto operasional.",
      show: enabled("photo_stamp"),
    },
    {
      href: "/workspace/applications",
      icon: AppWindow,
      name: "Application Hub",
      desc: "Akses cepat ke aplikasi eksternal operasional dan korporat.",
      show: ctx.moduleAccess.workspace?.read ?? false,
    },
    {
      href: "/workspace/drive",
      icon: FolderOpen,
      name: "Work Drive",
      desc: "Folder dan berkas kerja bersama tim.",
      show: ctx.moduleAccess.workspace?.read ?? false,
    },
  ].filter((t) => t.show);

  return (
    <>
      <h1 className="section-title">Halo, {ctx.displayName || ctx.username}</h1>
      <p className="subtitle">{today} — pilih modul untuk mulai bekerja.</p>
      <div className="workspace-grid" style={{ marginTop: 18 }}>
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="workspace-card">
              <span className="workspace-icon">
                <Icon size={22} />
              </span>
              <strong>{t.name}</strong>
              <span className="workspace-description">{t.desc}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
