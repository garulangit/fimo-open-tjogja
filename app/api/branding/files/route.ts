import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storageSignedUrl, type StorageBackend } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const ctx = await apiContext("branding.documents.view");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path || path.includes("..")) return NextResponse.json({ error: "bad path" }, { status: 400 });
  const supabase = await createClient();
  let backend: StorageBackend = "supabase";
  const { data: docRow } = await supabase
    .from("branding_admin_documents").select("storage_backend").eq("storage_path", path).maybeSingle();
  if (docRow?.storage_backend === "minio") backend = "minio";
  else if (!docRow) {
    const { data: photoRow } = await supabase
      .from("branding_bus_photos").select("storage_backend").eq("storage_path", path).maybeSingle();
    if (photoRow?.storage_backend === "minio") backend = "minio";
  }
  const url = await storageSignedUrl(backend, "branding-docs", path, 120);
  if (!url) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(url);
}
