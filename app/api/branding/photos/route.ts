import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storageUpload } from "@/lib/storage";

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/branding/documents?${q}`, req.url), 303);

export async function POST(req: NextRequest) {
  const ctx = await apiContext("branding.documents.manage");
  if (!ctx) return back(req, "error=izin");
  const form = await req.formData();
  const busId = String(form.get("bus_id") ?? "");
  const file = form.get("file");
  if (!busId || !(file instanceof File) || file.size === 0) return back(req, "error=wajib");
  if (file.size > 1 * 1024 * 1024) return back(req, "error=ukuran");
  if (!["image/jpeg", "image/png"].includes(file.type)) return back(req, "error=tipe");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `foto/${busId}/${Date.now()}-${safeName}`;
  const up = await storageUpload("branding-docs", path, new Uint8Array(await file.arrayBuffer()), file.type, false);
  if (up.error) return back(req, "error=unggah");
  const supabase = await createClient();
  const { error } = await supabase.from("branding_bus_photos").insert({
    bus_id: busId, storage_path: path, storage_backend: up.backend, file_name: file.name,
    file_size: file.size, uploaded_by: ctx.userId,
  });
  if (error) return back(req, "error=gagal");
  return back(req, "ok=foto-diunggah");
}
