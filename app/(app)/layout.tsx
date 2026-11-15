import { requireContext } from "@/lib/auth";
import { getModuleRegistry } from "@/lib/modules";
import ThemeToggle from "@/components/ThemeToggle";
import GlobalSearch from "@/components/GlobalSearch";
import MobileNav from "@/components/MobileNav";
import NavLinks from "@/components/NavLinks";
import AccountMenu from "@/components/AccountMenu";
import AppFooter from "@/components/AppFooter";
import BottomNav from "@/components/BottomNav";
import AgentFab from "@/components/AgentFab";
import Splash from "@/components/Splash";
import { LogoFull } from "@/components/Logo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const modulesAll = await getModuleRegistry();
  // Registry juga memuat workspace & agent (baris matriks Fase 1) — navigasi
  // klasik hanya menampilkan empat modul tampil ini.
  const NAV_MODULE_CODES = ["branding", "claim", "spm", "photo_stamp", "agent"];
  const modules = (modulesAll ?? []).filter((m) => NAV_MODULE_CODES.includes(m.code));
  // Agent tidak lagi jadi tab bottom-nav mobile — pintu masuknya tombol
  // melayang AgentFab di semua layar (aturan tampil sama seperti tab lama).
  const canAgent =
    (ctx.moduleAccess["agent"]?.read ?? false) &&
    modules.some((m) => m.code === "agent" && m.enabled);

  return (
    <>
      <Splash />
      <div className="orbs" />
      <div className="shell">
        <aside className="sidebar">
          <div className="brand brand-logo">
            <div style={{ width: 148 }}>
              <LogoFull />
            </div>
            <div className="oms" style={{ fontSize: 15, marginTop: 2 }}>
              FIMO<span className="grad-text">.</span>
            </div>
          </div>
          <NavLinks
            modules={modules}
            permissions={ctx.permissions}
            moduleAccess={ctx.moduleAccess}
            featureAccess={ctx.featureAccess}
          />
        </aside>
        <div className="main-col">
          <header className="app-header">
            <MobileNav />
            <div className="app-header-title">
              Fleet Integrated Management & Operations
              <span>Angkutan Perkotaan</span>
            </div>
            <div className="app-header-actions">
              <GlobalSearch />
              <ThemeToggle />
              <AccountMenu
                displayName={ctx.displayName || ctx.username}
                username={ctx.username}
                roles={ctx.roles}
              />
            </div>
          </header>
          <main className="main page-enter">
            {children}
            <AppFooter />
          </main>
        </div>
      </div>
      <AgentFab show={canAgent} />
      <BottomNav modules={modules} moduleAccess={ctx.moduleAccess} featureAccess={ctx.featureAccess} />
    </>
  );
}
