import { NextResponse } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storageSignedUrl } from "@/lib/storage";

export async function GET(request: Request) {
  const ctx = await apiContext("claim.claim.view");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path.startsWith("claims/"))
    return NextResponse.json({ error: "Path tidak valid." }, { status: 400 });
  const supabase = await createClient();
  const { data: docRow } = await supabase
    .from("claim_item_documents").select("storage_backend").eq("storage_path", path).maybeSingle();
  const url = await storageSignedUrl(
    docRow?.storage_backend === "minio" ? "minio" : "supabase", "claim-docs", path, 300);
  if (!url) return NextResponse.json({ error: "Gagal membuat tautan." }, { status: 500 });
  return NextResponse.redirect(url, 307);
}
