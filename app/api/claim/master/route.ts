import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiContext } from "@/lib/auth";

export async function POST(request: Request) {
  const ctx = await apiContext("claim.master.manage");
  const supabase = await createClient();
  if (!ctx) return NextResponse.redirect(new URL("/claim/master?err=izin", new URL(request.url).origin), 303);
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const back = (q: string) => NextResponse.redirect(new URL(`/claim/master?${q}`, BASE), 303);
  const form = await request.formData();
  const entity = String(form.get("_entity") ?? "");
  const del = String(form.get("_action") ?? "") === "delete";
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const id = s("id");

  const tables: Record<string, string> = {
    vehicle: "claim_vehicle_types",
    regulation: "claim_regulation_versions",
    doctype: "claim_document_types",
    category: "claim_cost_categories",
    requirement: "claim_document_requirements",
    template: "claim_letter_templates",
  };
  const table = tables[entity];
  if (!table) return back("err=" + encodeURIComponent("Entitas tidak dikenal."));

  if (del) {
    if (!id) return back("err=" + encodeURIComponent("ID kosong."));
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return back("err=" + encodeURIComponent("Gagal menghapus: " + error.message));
    return back("ok=" + encodeURIComponent("Data master dihapus."));
  }

  let payload: Record<string, unknown> | null = null;
  if (entity === "vehicle")
    payload = { code: s("code").toUpperCase(), name: s("name"), description: s("description") || null };
  if (entity === "regulation")
    payload = { code: s("code").toUpperCase(), title: s("title"), legal_basis: s("legal_basis") || null };
  if (entity === "doctype")
    payload = { code: s("code").toUpperCase(), name: s("name"), default_sort_order: Number(s("default_sort_order") || 1) };
  if (entity === "category") {
    let level = Number(s("level") || 1);
    const parentId = s("parent_id") || null;
    if (parentId) {
      const { data: parent } = await supabase
        .from("claim_cost_categories").select("level").eq("id", parentId).single();
      if (parent) level = Number(parent.level) + 1;
    }
    payload = {
      regulation_version_id: s("regulation_version_id"),
      vehicle_type_id: s("vehicle_type_id"),
      parent_id: parentId,
      code: s("code"), name: s("name"),
      category_type: s("category_type") || "DIRECT_COST",
      level, sort_order: Number(s("sort_order") || 0),
      is_input: form.get("is_input") === "on",
      is_calculated: form.get("is_calculated") === "on",
    };
  }
  if (entity === "requirement")
    payload = {
      cost_category_id: s("cost_category_id"),
      document_type_id: s("document_type_id"),
      is_mandatory: form.get("is_mandatory") !== "off",
      max_size_bytes: Math.round(Number(s("max_size_mb") || 15) * 1048576),
    };
  if (entity === "template")
    payload = {
      code: s("code").toUpperCase(), name: s("name"),
      header_title: s("header_title"), header_subtitle: s("header_subtitle"),
      body_template: s("body_template") || null,
      signatory_title: s("signatory_title"), signatory_name: s("signatory_name"),
      is_default: form.get("is_default") === "on",
    };
  if (!payload) return back("err=" + encodeURIComponent("Payload kosong."));
  const { error } = await supabase.from(table).insert(payload);
  if (error) return back("err=" + encodeURIComponent("Gagal menyimpan: " + error.message));
  return back("ok=" + encodeURIComponent("Data master ditambahkan."));
}
