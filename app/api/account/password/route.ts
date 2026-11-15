import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { usernameToEmail } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const current = String(form.get("current_password") ?? "");
  const next = String(form.get("new_password") ?? "");
  const confirm = String(form.get("confirm_password") ?? "");
  const back = (e: string) => NextResponse.redirect(`${origin}/change-password?error=${e}`, 303);

  if (next.length < 6) return back("pendek");
  if (next !== confirm) return back("beda");
  if (next === current) return back("sama");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?error=sesi`, 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  if (!profile) return back("lama");

  // Verifikasi password lama dengan percobaan masuk terpisah (tanpa menyentuh sesi saat ini)
  const anon = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: verifyError } = await anon.auth.signInWithPassword({
    email: usernameToEmail(profile.username),
    password: current,
  });
  if (verifyError) return back("lama");

  const { error: updateError } = await supabase.auth.updateUser({ password: next });
  if (updateError) return back("lama");

  const admin = createAdminClient();
  await admin.from("profiles").update({ must_change_password: false }).eq("id", user.id);
  await supabase.rpc("log_audit", {
    p_module: "platform",
    p_action: "account.password_change",
    p_entity_type: "profile",
    p_entity_id: user.id,
    p_detail: {},
  });

  return NextResponse.redirect(`${origin}/`, 303);
}
