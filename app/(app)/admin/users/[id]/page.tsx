import Link from "next/link";
import { ArrowLeft, ShieldCheck, UserRound } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessFromRows, MATRIX_MODULES, resolveFeatureAccess } from "@/lib/module-access";
import ModuleAccessMatrix, { type MatrixModuleRow } from "@/components/ModuleAccessMatrix";

const OK: Record<string, string> = {
  akses: "Akses modul berhasil disimpan.",
};
const ERR: Record<string, string> = {
  gagal: "Operasi gagal. Coba lagi.",
  superadmin: "Akun superadmin memiliki akses penuh secara implisit dan tidak diatur lewat matriks.",
};

export default async function UserAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await requireContext("platform.users.view");
  const { id } = await params;
  const { ok, error } = await searchParams;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, display_name, active, created_at")
    .eq("id", id)
    .single();
  if (!profile) {
    return (
      <>
        <h1 className="section-title">Akun tidak ditemukan</h1>
        <p className="subtitle">
          <Link href="/admin/users">← Kembali ke Manajemen User</Link>
        </p>
      </>
    );
  }

  const { data: roleRows } = await admin
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", id);
  const roles = (roleRows ?? [])
    .map((r) => (r.roles as unknown as { code: string } | null)?.code)
    .filter((c): c is string => Boolean(c));
  const targetIsSuperadmin = roles.includes("superadmin");
  const canManage = ctx.permissions.includes("platform.users.manage");

  const { data: registry } = await admin
    .from("module_registry")
    .select("code, name, status, sort_order")
    .order("sort_order");
  const modules: MatrixModuleRow[] = (registry ?? [])
    .filter((m) => (MATRIX_MODULES as readonly string[]).includes(m.code))
    .map((m) => ({ code: m.code, name: m.name, status: m.status }));

  const { data: accessRows } = await admin
    .from("user_module_access")
    .select("module_code, can_read, can_write")
    .eq("user_id", id);
  const initial = accessFromRows(accessRows ?? []);
  const { data: featureRows } = await admin
    .from("user_feature_access")
    .select("feature_code, allowed")
    .eq("user_id", id);
  const initialFeatures = resolveFeatureAccess(initial, featureRows ?? []);

  return (
    <>
      <p className="subtitle" style={{ marginBottom: 4 }}>
        <Link href="/admin/users"><ArrowLeft size={13} /> Manajemen User</Link>
      </p>
      <h1 className="section-title"><UserRound size={24} /> {profile.display_name || profile.username}</h1>
      <p className="subtitle">
        @{profile.username} · {profile.active ? "Aktif" : "Nonaktif"} · role: {roles.join(", ") || "—"}
      </p>
      {ok && <div className="alert ok">{OK[ok] ?? "Berhasil."}</div>}
      {error && <div className="alert error">{ERR[error] ?? "Gagal."}</div>}

      <div className="card">
        <h3 className="section-title" style={{ marginTop: 0 }}><ShieldCheck size={19} /> Akses Modul</h3>
        {targetIsSuperadmin ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Akun ini superadmin: akses semua modul penuh secara implisit (Read + Write),
            sehingga matriks tidak berlaku dan tidak perlu diatur.
          </p>
        ) : (
          <ModuleAccessMatrix
            userId={profile.id}
            modules={modules}
            initial={initial}
            initialFeatures={initialFeatures}
            canManage={canManage}
          />
        )}
      </div>
    </>
  );
}
