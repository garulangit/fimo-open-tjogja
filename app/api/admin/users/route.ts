import { NextResponse, type NextRequest } from "next/server";
import { apiContext, usernameToEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/admin/users?${q}`, 303);

  const ctx = await apiContext("platform.users.manage");
  if (!ctx) return back("error=gagal");

  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const displayName = String(form.get("display_name") ?? "").trim();
  const roleCode = String(form.get("role_code") ?? "admin");
  const password = String(form.get("password") ?? "");

  if (!/^[a-z0-9_]{3,32}$/.test(username)) return back("error=username");
  if (password.length < 6) return back("error=password");
  if (!["admin", "superadmin", "custom"].includes(roleCode)) return back("error=gagal");

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });
  if (createError || !created.user) return back("error=username");

  const { data: role } = await admin
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .single();
  if (!role) return back("error=gagal");
  await admin.from("user_roles").insert({
    user_id: created.user.id,
    role_id: role.id,
    granted_by: ctx.userId,
  });

  const supabase = await createClient();
  await supabase.rpc("log_audit", {
    p_module: "platform",
    p_action: "user.create",
    p_entity_type: "profile",
    p_entity_id: created.user.id,
    p_detail: { username, role: roleCode },
  });

  return back("ok=dibuat");
}
