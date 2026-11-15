/**
 * Akses modul per akun (matriks checkbox) — Fase 1, migration 0008.
 *
 * Sumber kebenaran pemberian akses modul adalah tabel user_module_access.
 * File ini adalah cermin TypeScript dari fungsi SQL
 * public.module_permission_codes() — keduanya HARUS selalu sama;
 * uji SQL 0008 dan suite E2E menjaga agar tidak drift.
 *
 * Permission platform.* TIDAK diatur di sini (tetap dari role).
 */

export interface ModuleGrant {
  read: boolean;
  write: boolean;
}

export type ModuleAccess = Record<string, ModuleGrant>;

/** Modul yang tampil sebagai baris matriks, urut tampil. */
export const MATRIX_MODULES = [
  "branding",
  "claim",
  "spm",
  "photo_stamp",
  "workspace",
  "agent",
] as const;

export type MatrixModule = (typeof MATRIX_MODULES)[number];

/** Pemetaan modul -> kode permission. CERMIN dari module_permission_codes() di SQL. */
export const MODULE_PERMISSION_CODES: Record<string, { read: string[]; write: string[] }> = {
  branding: {
    read: [
      "branding.dashboard.view",
      "branding.bus.view",
      "branding.booking.view",
      "branding.pricing.view",
      "branding.documents.view",
      "branding.reports.view",
    ],
    write: [
      "branding.bus.manage",
      "branding.booking.manage",
      "branding.booking.delete",
      "branding.pricing.manage",
      "branding.documents.manage",
    ],
  },
  claim: {
    read: [
      "claim.dashboard.view",
      "claim.claim.view",
      "claim.master.view",
      "claim.reports.view",
    ],
    write: [
      "claim.claim.create",
      "claim.claim.edit",
      "claim.claim.submit",
      "claim.claim.verify",
      "claim.claim.approve",
      "claim.claim.delete",
      "claim.master.manage",
    ],
  },
  spm: { read: ["spm.view"], write: ["spm.manage"] },
  photo_stamp: { read: [], write: [] },
  workspace: { read: ["workspace.view"], write: [] },
  agent: { read: ["agent.use"], write: [] },
};

/** Pola preset per role — CERMIN dari seed/trigger di migration 0008. */
export const ROLE_PRESETS: Record<string, Partial<Record<MatrixModule, ModuleGrant>>> = {
  admin: {
    branding: { read: true, write: true },
    claim: { read: true, write: true },
  },
  // superadmin: bypass implisit (semua modul, read+write) — tidak ada baris.
};

export function emptyModuleAccess(): ModuleAccess {
  const out: ModuleAccess = {};
  for (const code of MATRIX_MODULES) out[code] = { read: false, write: false };
  return out;
}

export function fullModuleAccess(): ModuleAccess {
  const out: ModuleAccess = {};
  for (const code of MATRIX_MODULES) out[code] = { read: true, write: true };
  return out;
}

export function accessFromRows(
  rows: { module_code: string; can_read: boolean; can_write: boolean }[]
): ModuleAccess {
  const out = emptyModuleAccess();
  for (const r of rows) {
    if (r.module_code in out) {
      out[r.module_code] = { read: r.can_read, write: r.can_write };
    }
  }
  return out;
}

/** Turunkan kode permission modul dari matriks (bukan platform.*).
 *  Baris fitur yang ditolak (allowed=false) mengurangi kode terpetakannya —
 *  cermin dari has_permission() v2 di migration 0012. */
export function permissionsFromAccess(
  access: ModuleAccess,
  featureRows: { feature_code: string; allowed: boolean }[] = [],
): string[] {
  const codes: string[] = [];
  for (const [module, grant] of Object.entries(access)) {
    const map = MODULE_PERMISSION_CODES[module];
    if (!map) continue;
    if (grant.read) codes.push(...map.read);
    if (grant.write) codes.push(...map.write);
  }
  const denied = new Set<string>();
  for (const r of featureRows) {
    if (r.allowed) continue;
    for (const c of FEATURE_PERMISSION_CODES[r.feature_code] ?? []) denied.add(c);
  }
  const kept = codes.filter((c) => !denied.has(c));
  // Fitur GRANT: tambahkan kodenya bila dicentang + modul induk terbaca.
  for (const r of featureRows) {
    if (!r.allowed) continue;
    const grants = GRANT_FEATURE_PERMISSION_CODES[r.feature_code];
    if (!grants) continue;
    const module = r.feature_code.split(".")[0];
    if (access[module]?.read) kept.push(...grants);
  }
  return [...new Set(kept)];
}

export function canRead(access: ModuleAccess, module: string): boolean {
  return access[module]?.read ?? false;
}

export function canWrite(access: ModuleAccess, module: string): boolean {
  return access[module]?.write ?? false;
}

/* ================= Fitur (submenu) — migration 0012 ================= */

/**
 * Submenu per modul yang punya checkbox sendiri di matriks.
 * code = "<modul>.<fitur>", label mengikuti label di NavLinks.
 */
import { APPLICATIONS, DOCUMENTS } from "@/components/workspace/catalog";

export interface ModuleFeature {
  code: string;
  label: string;
  /** Sub-item (mis. shortcut di dalam grup): dirender menjorok di matriks. */
  sub?: boolean;
}

export const MODULE_FEATURES: Record<string, ModuleFeature[]> = {
  branding: [
    { code: "branding.overview", label: "Overview" },
    { code: "branding.bookings", label: "Branding (Booking)" },
    { code: "branding.history", label: "History" },
    { code: "branding.buses", label: "Bus" },
    { code: "branding.pricing", label: "Pricelist" },
    { code: "branding.documents", label: "Dokumen" },
    { code: "branding.reports", label: "Laporan" },
    { code: "branding.override", label: "Override Total (Nego)" },
  ],
  claim: [
    { code: "claim.overview", label: "Overview" },
    { code: "claim.list", label: "Daftar Klaim" },
    { code: "claim.create", label: "Pengajuan" },
    { code: "claim.verify", label: "Verifikasi" },
    { code: "claim.master", label: "Master Data" },
    { code: "claim.reports", label: "Laporan" },
  ],
  spm: [
    { code: "spm.overview", label: "Overview" },
    { code: "spm.reconciliation", label: "Rekonsiliasi" },
    { code: "spm.penalties", label: "Denda" },
    { code: "spm.rates", label: "Besaran Denda" },
  ],
  workspace: [
    { code: "workspace.applications", label: "Application Hub" },
    // Setiap shortcut punya checkbox sendiri (permintaan Bos 11 Nov):
    // tidak semua akun perlu melihat shortcut yang sama.
    ...APPLICATIONS.map((a) => ({ code: `workspace.app.${a.icon}`, label: a.name, sub: true })),
    { code: "workspace.drive", label: "Work Drive" },
    ...DOCUMENTS.map((d) => ({ code: `workspace.drive.${d.slug}`, label: d.title, sub: true })),
  ],
};

export const ALL_FEATURE_CODES: string[] = Object.values(MODULE_FEATURES).flat().map((f) => f.code);

/**
 * Kode permission yang HILANG bila fitur ditolak — CERMIN PERSIS dari
 * public.feature_permission_codes() di migration 0012. Fitur yang tidak
 * tercantum di sini (history, semua SPM, workspace) berbagi kode dengan
 * fitur lain; penolakannya ditegakkan di lapisan halaman (featureAccess).
 */
export const FEATURE_PERMISSION_CODES: Record<string, string[]> = {
  "branding.overview": ["branding.dashboard.view"],
  "branding.bookings": ["branding.booking.view", "branding.booking.manage", "branding.booking.delete"],
  "branding.buses": ["branding.bus.view", "branding.bus.manage"],
  "branding.pricing": ["branding.pricing.view", "branding.pricing.manage"],
  "branding.documents": ["branding.documents.view", "branding.documents.manage"],
  "branding.reports": ["branding.reports.view"],
  "claim.overview": ["claim.dashboard.view"],
  "claim.list": ["claim.claim.view"],
  "claim.create": ["claim.claim.create", "claim.claim.edit", "claim.claim.submit", "claim.claim.delete"],
  "claim.verify": ["claim.claim.verify", "claim.claim.approve"],
  "claim.master": ["claim.master.view", "claim.master.manage"],
  "claim.reports": ["claim.reports.view"],
};

/** Akses fitur yang sudah diresolusi: modul Read DAN tidak ditolak eksplisit. */
export type FeatureAccess = Record<string, boolean>;

/** Fitur GRANT (opt-in, migration 0013) — CERMIN public.grant_feature_permission_codes().
 *  Kebalikan fitur biasa: bawaannya MATI, permission hanya muncul bila fitur
 *  dicentang eksplisit DAN modul induk bisa dibaca. */
export const GRANT_FEATURE_PERMISSION_CODES: Record<string, string[]> = {
  "branding.override": ["branding.total.override"],
};

export const GRANT_FEATURES = new Set(Object.keys(GRANT_FEATURE_PERMISSION_CODES));

export function resolveFeatureAccess(
  access: ModuleAccess,
  rows: { feature_code: string; allowed: boolean }[],
): FeatureAccess {
  const explicit = new Map(rows.map((r) => [r.feature_code, r.allowed]));
  const out: FeatureAccess = {};
  for (const [module, features] of Object.entries(MODULE_FEATURES)) {
    const moduleRead = access[module]?.read ?? false;
    for (const f of features) {
      out[f.code] = GRANT_FEATURES.has(f.code)
        ? moduleRead && explicit.get(f.code) === true
        : moduleRead && (explicit.get(f.code) ?? true);
    }
  }
  return out;
}

export function fullFeatureAccess(): FeatureAccess {
  const out: FeatureAccess = {};
  for (const code of ALL_FEATURE_CODES) out[code] = true;
  return out;
}

/** Visibilitas satu shortcut Workspace: grup induk boleh DAN shortcut boleh. */
export function workspaceShortcutVisible(
  featureAccess: FeatureAccess,
  kind: "app" | "drive",
  slug: string,
): boolean {
  const group = kind === "app" ? featureAccess["workspace.applications"] : featureAccess["workspace.drive"];
  return Boolean(group) && featureAccess[`workspace.${kind}.${slug}`] !== false;
}

/** Slug shortcut yang terlihat untuk satu jenis ("app" | "drive"). */
export function visibleWorkspaceSlugs(
  featureAccess: FeatureAccess,
  kind: "app" | "drive",
): string[] {
  const all = kind === "app" ? APPLICATIONS.map((a) => a.icon as string) : DOCUMENTS.map((d) => d.slug as string);
  return all.filter((slug) => workspaceShortcutVisible(featureAccess, kind, slug));
}
