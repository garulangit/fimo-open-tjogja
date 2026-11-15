import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.nextUrl.origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/admin/users?${q}`, 303);
  const { id } = await params;

  const ctx = await apiContext("platform.users.manage");
  if (!ctx) return back("error=gagal");

  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const admin = createAdminClient();
  const supabase = await createClient();

  if (action === "reset") {
    const password = String(form.get("password") ?? "");
    if (password.length < 6) return back("error=password");
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return back("error=gagal");
    await admin.from("profiles").update({ must_change_password: true }).eq("id", id);
    await supabase.rpc("log_audit", {
      p_module: "platform",
      p_action: "user.password_reset",
      p_entity_type: "profile",
      p_entity_id: id,
      p_detail: {},
    });
    return back("ok=reset");
  }

  if (action === "active") {
    const makeActive = String(form.get("active")) === "true";
    if (!makeActive) {
      if (id === ctx.userId) return back("error=diri");
      // Penjaga superadmin terakhir (service-role melewati trigger, jadi cek eksplisit di sini)
      const { data: targetRoles } = await admin
        .from("user_roles")
        .select("roles(code)")
        .eq("user_id", id);
      const isSA = (targetRoles ?? []).some(
        (r) => (r.roles as unknown as { code: string } | null)?.code === "superadmin"
      );
      if (isSA) {
        const { data: saRows } = await admin
          .from("user_roles")
          .select("user_id, roles!inner(code), profiles!inner(active)")
          .eq("roles.code", "superadmin");
        const othersActive = (saRows ?? []).filter(
          (r) =>
            r.user_id !== id &&
            (r.profiles as unknown as { active: boolean } | null)?.active
        ).length;
        if (othersActive === 0) return back("error=terakhir");
      }
    }
    await admin.from("profiles").update({ active: makeActive }).eq("id", id);
    await admin.auth.admin.updateUserById(id, {
      ban_duration: makeActive ? "none" : "876000h",
    });
    await supabase.rpc("log_audit", {
      p_module: "platform",
      p_action: makeActive ? "user.activate" : "user.deactivate",
      p_entity_type: "profile",
      p_entity_id: id,
      p_detail: {},
    });
    return back("ok=aktif");
  }

  return back("error=gagal");
}
