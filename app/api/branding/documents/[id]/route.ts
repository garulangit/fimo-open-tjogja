import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storageRemove } from "@/lib/storage";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/documents?${q}`, req.url), 303);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("branding.documents.manage");
  if (!ctx) return back(req, "error=izin");
  const { id } = await params; // id dokumen administrasi
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("branding_admin_documents").select("storage_path, storage_backend").eq("id", id).single();
  if (doc?.storage_path) {
    await storageRemove(doc.storage_backend === "minio" ? "minio" : "supabase", "branding-docs", [doc.storage_path]);
  }
  const { error } = await supabase
    .from("branding_admin_documents")
    .update({ storage_path: null, file_name: null, file_size: null })
    .eq("id", id);
  if (error) return back(req, "error=gagal");
  return back(req, "ok=dokumen-dihapus");
}
