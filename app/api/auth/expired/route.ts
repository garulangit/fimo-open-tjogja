import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Tujuan pengalihan middleware saat umur sesi melewati batas 20 jam:
 * akhiri sesi Supabase di sini (route handler bisa menulis cookie),
 * lalu arahkan ke halaman login dengan pesan sesi berakhir.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${request.nextUrl.origin}/login?error=sesi`, 303);
}
