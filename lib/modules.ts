import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Registry modul (module_registry) — dibaca layout aplikasi dan dashboard.
 * Di-cache per request (React cache) supaya tidak di-query dua kali dalam
 * satu kali muat halaman. Isinya nyaris tidak pernah berubah di tengah
 * request, jadi berbagi hasil aman.
 */
export const getModuleRegistry = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("module_registry")
    .select("code, name, enabled")
    .order("sort_order");
  return data ?? [];
});
