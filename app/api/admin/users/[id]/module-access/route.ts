import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_FEATURE_CODES, MATRIX_MODULES } from "@/lib/module-access";

/**
 * Simpan matriks akses modul per akun (Fase 1, migration 0008).
 * Form POST mengikuti pola route admin lain: redirect kembali ke halaman
 * detail user dengan penanda ok/error. Validasi server adalah penegak
 * sebenarnya — UI hanya membantu.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.nextUrl.origin;
  const { id } = await params;
  const back = (q: string) =>
    NextResponse.redirect(`${origin}/admin/users/${id}?${q}`, 303);

  const ctx = await apiContext("platform.users.manage");
  if (!ctx) return back("error=gagal");

  const admin = createAdminClient();

  // Akun superadmin tidak diatur lewat matriks (bypass implisit).
  const { data: targetRoles } = await admin
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", id);
  const targetIsSuperadmin = (targetRoles ?? []).some(
    (r) => (r.roles as unknown as { code: string } | null)?.code === "superadmin"
  );
  if (targetIsSuperadmin) return back("error=superadmin");

  // Status modul dari registry: modul 'unavailable' tidak boleh diberi akses.
  const { data: registry } = await admin
    .from("module_registry")
    .select("code, status");
  const statusByCode = new Map((registry ?? []).map((m) => [m.code, m.status]));

  const form = await request.formData();

  const { data: current } = await admin
    .from("user_module_access")
    .select("module_code, can_read, can_write")
    .eq("user_id", id);
  const currentByCode = new Map(
    (current ?? []).map((r) => [r.module_code, { read: r.can_read, write: r.can_write }])
  );

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const upserts: {
    user_id: string;
    module_code: string;
    can_read: boolean;
    can_write: boolean;
    updated_by: string;
    updated_at: string;
  }[] = [];

  for (const code of MATRIX_MODULES) {
    if (statusByCode.get(code) === "unavailable") continue;
    let read = form.get(`read_${code}`) != null;
    let write = form.get(`write_${code}`) != null;
    if (write) read = true; // Write mengimplikasikan Read (juga dijaga constraint DB)
    const prev = currentByCode.get(code) ?? { read: false, write: false };
    if (prev.read !== read || prev.write !== write) {
      changes[code] = { from: prev, to: { read, write } };
    }
    upserts.push({
      user_id: id,
      module_code: code,
      can_read: read,
      can_write: write,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length > 0) {
    const { error } = await admin
      .from("user_module_access")
      .upsert(upserts, { onConflict: "user_id,module_code" });
    if (error) return back("error=gagal");
  }

  // Fitur (submenu), migration 0012: snapshot penuh — baris lama diganti.
  // Checkbox feat_<kode> yang tidak terkirim berarti submenu ditolak.
  const { data: currentFeatures } = await admin
    .from("user_feature_access")
    .select("feature_code, allowed")
    .eq("user_id", id);
  const prevDenied = new Set(
    (currentFeatures ?? []).filter((r) => !r.allowed).map((r) => r.feature_code)
  );
  const featureRows = ALL_FEATURE_CODES.map((code) => ({
    user_id: id,
    feature_code: code,
    allowed: form.get(`feat_${code}`) != null,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }));
  const nextDenied = new Set(featureRows.filter((r) => !r.allowed).map((r) => r.feature_code));
  const deniedChanged =
    prevDenied.size !== nextDenied.size || [...prevDenied].some((c) => !nextDenied.has(c));
  if (deniedChanged) changes["features_denied"] = { from: [...prevDenied], to: [...nextDenied] };

  await admin.from("user_feature_access").delete().eq("user_id", id);
  const { error: featError } = await admin.from("user_feature_access").insert(featureRows);
  if (featError) return back("error=gagal");

  if (Object.keys(changes).length > 0) {
    const supabase = await createClient();
    await supabase.rpc("log_audit", {
      p_module: "platform",
      p_action: "user.module_access.update",
      p_entity_type: "profile",
      p_entity_id: id,
      p_detail: { changes },
    });
  }

  return back("ok=akses");
}
