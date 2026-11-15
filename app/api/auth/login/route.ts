import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { usernameToEmail } from "@/lib/auth";
import {
  LOGIN_MAX_FAILURES,
  LOGIN_MAX_FAILURES_IP,
  LOGIN_WINDOW_MINUTES,
  MAX_SESSIONS_PER_USER,
} from "@/lib/login-guard";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Kegagalan login dalam jendela, dihitung sejak login sukses terakhir untuk
 * kunci yang sama (username atau IP). Sukses meng-nol-kan hitungan.
 */
async function failedCount(
  admin: Admin,
  column: "username" | "ip",
  value: string
): Promise<number> {
  if (!value) return 0;
  const windowStart = new Date(
    Date.now() - LOGIN_WINDOW_MINUTES * 60_000
  ).toISOString();
  const { data: lastOk } = await admin
    .from("login_attempts")
    .select("created_at")
    .eq(column, value)
    .eq("succeeded", true)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(1);
  const floor = lastOk?.[0]?.created_at ?? windowStart;
  const { count } = await admin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .eq("succeeded", false)
    .gt("created_at", floor);
  return count ?? 0;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const origin = request.nextUrl.origin;
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "";

  const admin = createAdminClient();

  // Rate limit: tolak sementara bila kegagalan dalam jendela sudah mencapai
  // batas — per username ATAU per IP, mana yang lebih dulu penuh.
  const [failUser, failIp] = await Promise.all([
    failedCount(admin, "username", username),
    failedCount(admin, "ip", ip),
  ]);
  if (failUser >= LOGIN_MAX_FAILURES || failIp >= LOGIN_MAX_FAILURES_IP) {
    return NextResponse.redirect(`${origin}/login?error=terkunci`, 303);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error || !data.user) {
    await admin
      .from("login_attempts")
      .insert({ username, ip, succeeded: false });
    return NextResponse.redirect(`${origin}/login?error=kredensial`, 303);
  }

  await admin.from("login_attempts").insert({ username, ip, succeeded: true });
  // Maksimum sesi aktif per akun: cabut sesi tertua di luar batas.
  await admin.rpc("prune_user_sessions", {
    p_user_id: data.user.id,
    p_keep: MAX_SESSIONS_PER_USER,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("active")
    .eq("id", data.user.id)
    .single();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=nonaktif`, 303);
  }
  return NextResponse.redirect(`${origin}/`, 303);
}
