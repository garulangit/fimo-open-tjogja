import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  accessFromRows,
  fullFeatureAccess,
  fullModuleAccess,
  permissionsFromAccess,
  resolveFeatureAccess,
  type FeatureAccess,
  type ModuleAccess,
} from "@/lib/module-access";

export const USERNAME_EMAIL_DOMAIN = "oms.internal";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export interface SessionContext {
  userId: string;
  username: string;
  displayName: string;
  active: boolean;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
  /** Akses modul per akun (matriks checkbox, migration 0008). */
  moduleAccess: ModuleAccess;
  /** Akses per submenu/fitur (migration 0012), sudah diresolusi. */
  featureAccess: FeatureAccess;
}

interface ProfileRow {
  username: string;
  display_name: string;
  active: boolean;
  must_change_password: boolean;
}
interface ModuleAccessRow {
  module_code: string;
  can_read: boolean;
  can_write: boolean;
}
interface FeatureAccessRow {
  feature_code: string;
  allowed: boolean;
}

/** Resolusi akses dari bahan mentah — dipakai jalur RPC maupun jalur lama. */
function buildContext(
  userId: string,
  profile: ProfileRow,
  roles: string[],
  roleCodes: string[],
  accessRows: ModuleAccessRow[],
  featureRows: FeatureAccessRow[],
): SessionContext {
  // Fase 1 (migration 0008): permission modul berasal dari matriks per akun,
  // BUKAN dari role. Role hanya membawa platform.* — kecuali superadmin yang
  // bypass (memegang semua kode). Cermin dari public.has_permission() di SQL.
  const isSuperadmin = roles.includes("superadmin");
  const moduleAccess = isSuperadmin
    ? fullModuleAccess()
    : accessFromRows(accessRows);
  const featureAccess = isSuperadmin
    ? fullFeatureAccess()
    : resolveFeatureAccess(moduleAccess, featureRows);
  const baseCodes = isSuperadmin
    ? roleCodes
    : roleCodes.filter((c) => c.startsWith("platform."));
  const permissions = [
    ...new Set([...baseCodes, ...permissionsFromAccess(moduleAccess, featureRows)]),
  ];

  return {
    userId,
    username: profile.username,
    displayName: profile.display_name,
    active: profile.active,
    mustChangePassword: profile.must_change_password,
    roles,
    permissions,
    moduleAccess,
    featureAccess,
  };
}

async function loadSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Jalur utama (migration 0020): seluruh bahan konteks dalam SATU panggilan
  // RPC. Bila fungsi belum tersedia di environment (migration belum jalan)
  // atau gagal, jatuh ke jalur query langsung di bawah — semantik identik.
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_session_context");
  if (!rpcError && rpcData) {
    const raw = rpcData as {
      profile: ProfileRow | null;
      roles: string[];
      role_permission_codes: string[];
      module_access: ModuleAccessRow[];
      feature_access: FeatureAccessRow[];
    };
    if (!raw.profile) return null;
    return buildContext(
      user.id,
      raw.profile,
      raw.roles ?? [],
      raw.role_permission_codes ?? [],
      raw.module_access ?? [],
      raw.feature_access ?? [],
    );
  }

  // Jalur lama: empat tabel independen dalam satu gelombang paralel,
  // lalu rantai role_permissions -> permissions yang memang dependen.
  const [profileRes, userRolesRes, accessRes, featureRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, active, must_change_password")
      .eq("id", user.id)
      .single(),
    supabase.from("user_roles").select("role_id, roles(code)").eq("user_id", user.id),
    supabase
      .from("user_module_access")
      .select("module_code, can_read, can_write")
      .eq("user_id", user.id),
    supabase
      .from("user_feature_access")
      .select("feature_code, allowed")
      .eq("user_id", user.id),
  ]);
  const profile = profileRes.data;
  if (!profile) return null;

  const userRoles = userRolesRes.data;
  const roleIds = (userRoles ?? []).map((r) => r.role_id);
  const roles = (userRoles ?? [])
    .map((r) => (r.roles as unknown as { code: string } | null)?.code)
    .filter((c): c is string => Boolean(c));

  let roleCodes: string[] = [];
  if (roleIds.length > 0) {
    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("permission_id")
      .in("role_id", roleIds);
    const permIds = [...new Set((rolePerms ?? []).map((rp) => rp.permission_id))];
    if (permIds.length > 0) {
      const { data: perms } = await supabase
        .from("permissions")
        .select("code")
        .in("id", permIds);
      roleCodes = (perms ?? []).map((p) => p.code);
    }
  }

  return buildContext(
    user.id,
    profile,
    roles,
    roleCodes,
    accessRes.data ?? [],
    featureRes.data ?? [],
  );
}

/**
 * Konteks sesi lengkap (profil + role + permission) untuk user yang login.
 * Di-cache per request (React cache): layout dan halaman yang sama-sama
 * memanggil requireContext() kini berbagi SATU kali eksekusi — sebelumnya
 * seluruh rangkaian query berjalan dua kali untuk satu kali muat halaman.
 */
export const getSessionContext = cache(loadSessionContext);

/** Guard halaman: wajib login; opsional wajib permission tertentu. */
export async function requireContext(permission?: string): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.active) redirect("/login?error=nonaktif");
  if (permission && !ctx.permissions.includes(permission)) redirect("/");
  return ctx;
}

/** Guard API: kembalikan konteks atau null (route membalas 403 sendiri). */
export async function apiContext(permission?: string): Promise<SessionContext | null> {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.active) return null;
  if (permission && !ctx.permissions.includes(permission)) return null;
  return ctx;
}
