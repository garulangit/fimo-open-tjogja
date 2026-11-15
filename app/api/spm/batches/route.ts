import { NextResponse } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Riwayat impor CSV (Dishub & operator). */
export async function GET() {
  const ctx = await apiContext("spm.view");
  if (!ctx) return NextResponse.json({ error: "izin" }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spm_import_batches")
    .select(
      "id, source, operator_name, file_name, row_count, inserted_count, duplicate_count, error_count, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  return NextResponse.json({ batches: data ?? [] });
}
