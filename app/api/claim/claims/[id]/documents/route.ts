import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { apiContext } from "@/lib/auth";
import { storageUpload } from "@/lib/storage";
import { loadClaimBundle, recalcClaim } from "@/lib/claim-server";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actx = await apiContext("claim.claim.edit");
  const { id } = await ctx.params;
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const back = (q: string) => NextResponse.redirect(new URL(`/claim/${id}?${q}`, BASE), 303);
  const supabase = await createClient();
  if (!actx) return back("err=" + encodeURIComponent("Tidak memiliki izin."));
  const bundle = await loadClaimBundle(supabase, id);
  if (!bundle) return back("err=" + encodeURIComponent("Klaim tidak ditemukan."));
  if (!["DRAFT", "REVISION_REQUIRED"].includes(bundle.claim.status))
    return back("err=" + encodeURIComponent("Dokumen terkunci pada status ini."));

  const form = await request.formData();
  const itemId = String(form.get("claim_item_id") ?? "");
  const docTypeId = String(form.get("document_type_id") ?? "");
  const file = form.get("file");
  const item = bundle.items.find((i) => i.id === itemId);
  if (!item || !(file instanceof File) || file.size === 0)
    return back("err=" + encodeURIComponent("Item / berkas tidak lengkap."));
  if (file.type !== "application/pdf")
    return back("err=" + encodeURIComponent("Berkas bukti klaim wajib PDF."));
  const req = bundle.requirements.find(
    (r) => r.cost_category_id === item.cost_category_id && r.document_type_id === docTypeId,
  );
  const maxBytes = req?.max_size_bytes ?? 20971520;
  if (file.size > maxBytes)
    return back("err=" + encodeURIComponent(`Ukuran berkas melebihi batas ${Math.round(maxBytes / 1048576)} MB.`));

  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  let pages = 1;
  try { pages = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount(); } catch { /* abaikan */ }

  const path = `claims/${id}/${itemId}/${docTypeId}.pdf`;
  const up = await storageUpload("claim-docs", path, bytes, "application/pdf", true);
  if (up.error) return back("err=" + encodeURIComponent("Gagal mengunggah: " + up.error));

  const { error } = await supabase.from("claim_item_documents").upsert({
    claim_id: id, claim_item_id: itemId, document_type_id: docTypeId,
    storage_path: path, storage_backend: up.backend, original_filename: file.name, mime_type: file.type,
    file_size_bytes: file.size, page_count: pages, checksum_sha256: checksum,
    uploaded_by: actx.userId,
  }, { onConflict: "claim_item_id,document_type_id" });
  if (error) return back("err=" + encodeURIComponent("Gagal mencatat dokumen: " + error.message));
  await recalcClaim(supabase, id);
  await supabase.rpc("log_audit", {
    p_module: "claim", p_action: "claim.document_upload", p_entity_type: "claim",
    p_entity_id: id, p_detail: { item: item.category.code, filename: file.name },
  });
  return back("ok=" + encodeURIComponent(`Bukti ${item.category.code} terunggah.`));
}
