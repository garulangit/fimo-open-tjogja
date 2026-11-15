import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { searchAll } from "@/lib/search";

// Pencarian global lintas modul. Cukup login; cakupan hasil mengikuti
// akses modul akun (ditegakkan di lib/search.ts + RLS).
export async function GET(req: NextRequest) {
  const ctx = await apiContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2)
    return NextResponse.json({ q, groups: [] });
  const supabase = await createClient();
  const groups = await searchAll(supabase, ctx, q);
  return NextResponse.json({ q, groups });
}
