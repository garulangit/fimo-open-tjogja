import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/documents?${q}`, req.url), 303);

export async function POST(req: NextRequest) {
  const ctx = await apiContext("branding.documents.manage");
  if (!ctx) return back(req, "error=izin");
  const form = await req.formData();
  const action = String(form.get("_action") ?? "create-record");
  const supabase = await createClient();

  if (action === "upload") {
    const recordId = String(form.get("record_id") ?? "");
    const docType = String(form.get("doc_type") ?? "");
    const file = form.get("file");
    if (!recordId || !docType || !(file instanceof File) || file.size === 0)
      return back(req, "error=wajib");
    const { DOC_MAX_BYTES } = await import("@/lib/branding");
    const max = DOC_MAX_BYTES[docType] ?? 500 * 1024;
    if (file.size > max) return back(req, "error=ukuran");
    if (file.type !== "application/pdf") return back(req, "error=tipe");
    const { storageUpload } = await import("@/lib/storage");
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `administrasi/${recordId}/${docType}/${safeName}`;
    const up = await storageUpload("branding-docs", path, new Uint8Array(await file.arrayBuffer()), file.type, true);
    if (up.error) return back(req, "error=unggah");
    const { error } = await supabase.from("branding_admin_documents").upsert(
      {
        record_id: recordId, doc_type: docType, storage_path: path, storage_backend: up.backend,
        file_name: file.name, file_size: file.size, uploaded_by: ctx.userId,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "record_id,doc_type" },
    );
    if (error) return back(req, "error=gagal");
    return back(req, "ok=dokumen-diunggah");
  }

  const brand = String(form.get("brand_name") ?? "").trim();
  if (!brand) return back(req, "error=wajib");
  const { error } = await supabase.from("branding_admin_records").insert({
    brand_name: brand,
    company_name: String(form.get("company_name") ?? "").trim(),
  });
  if (error) return back(req, error.code === "23505" ? "error=duplikat" : "error=gagal");
  return back(req, "ok=record-dibuat");
}
