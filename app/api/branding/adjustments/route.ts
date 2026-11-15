import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Override total transaksi Branding (nego) — migration 0013, KUNCI RASIO.
 * POST simpan: total kesepakatan dihitung ulang rasionya dari total snapshot
 * SAAT INI di server (klien tidak dipercaya), penyesuaian aktif sebelumnya
 * dinonaktifkan (riwayat ledger utuh), lalu baris baru menjadi yang aktif.
 * POST {action:"remove"}: cabut penyesuaian aktif (total kembali ke snapshot).
 * GET ?key=: riwayat penyesuaian satu grup (untuk popup).
 */

async function groupRows(admin: ReturnType<typeof createAdminClient>, key: string) {
  const cols = "id, transaction_id, reference_no, pricing_snapshot";
  if (key.startsWith("TANPA-REFERENSI-")) {
    const { data } = await admin.from("branding_bookings").select(cols).eq("id", key.slice("TANPA-REFERENSI-".length));
    return data ?? [];
  }
  let { data } = await admin.from("branding_bookings").select(cols).eq("transaction_id", key);
  if (!data?.length) ({ data } = await admin.from("branding_bookings").select(cols).eq("reference_no", key));
  if (!data?.length) ({ data } = await admin.from("branding_bookings").select(cols).eq("id", key));
  return data ?? [];
}

export async function GET(req: NextRequest) {
  const ctx = await apiContext("branding.booking.view");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key) return NextResponse.json({ error: "key wajib" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branding_total_adjustments")
    .select("id, computed_total, adjusted_total, ratio, reason, is_active, created_by_name, created_at")
    .eq("transaction_key", key)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await apiContext("branding.total.override");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as {
    transaction_key?: string;
    adjusted_total?: number;
    reason?: string;
    action?: string;
  } | null;
  const key = (body?.transaction_key ?? "").trim();
  if (!key) return NextResponse.json({ error: "transaction_key wajib" }, { status: 400 });

  const admin = createAdminClient();
  const session = await createClient();

  if (body?.action === "remove") {
    const { data: active } = await admin
      .from("branding_total_adjustments")
      .select("id, ratio")
      .eq("transaction_key", key)
      .eq("is_active", true)
      .maybeSingle();
    if (!active) return NextResponse.json({ error: "tidak ada penyesuaian aktif" }, { status: 404 });
    const { error } = await admin
      .from("branding_total_adjustments")
      .update({ is_active: false })
      .eq("id", active.id);
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });
    await session.rpc("log_audit", {
      p_module: "branding",
      p_action: "branding.total_override.remove",
      p_entity_type: "branding_total_adjustment",
      p_entity_id: active.id,
      p_detail: { transaction_key: key, ratio_was: active.ratio },
    });
    return NextResponse.json({ ok: true });
  }

  const adjusted = Number(body?.adjusted_total);
  const reason = (body?.reason ?? "").trim();
  if (!Number.isFinite(adjusted) || adjusted < 0) {
    return NextResponse.json({ error: "total kesepakatan tidak valid" }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "alasan wajib diisi" }, { status: 400 });

  const rows = await groupRows(admin, key);
  if (!rows.length) return NextResponse.json({ error: "grup transaksi tidak ditemukan" }, { status: 404 });
  const computed = rows.reduce(
    (sum, r) => sum + (Number((r.pricing_snapshot as { totalWithPpn?: unknown } | null)?.totalWithPpn) || 0),
    0,
  );
  if (computed <= 0) return NextResponse.json({ error: "total snapshot grup ini 0 — tidak bisa dinego" }, { status: 400 });
  const ratio = Math.round((adjusted / computed) * 1e8) / 1e8;
  const first = rows[0] as { transaction_id: string | null; reference_no: string | null };

  const { error: offErr } = await admin
    .from("branding_total_adjustments")
    .update({ is_active: false })
    .eq("transaction_key", key)
    .eq("is_active", true);
  if (offErr) return NextResponse.json({ error: "db" }, { status: 500 });

  const { data, error } = await admin
    .from("branding_total_adjustments")
    .insert({
      transaction_key: key,
      transaction_id: first.transaction_id,
      reference_no: first.reference_no,
      computed_total: computed,
      adjusted_total: adjusted,
      ratio,
      reason,
      created_by: ctx.userId,
      created_by_name: ctx.username,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });

  await session.rpc("log_audit", {
    p_module: "branding",
    p_action: "branding.total_override.set",
    p_entity_type: "branding_total_adjustment",
    p_entity_id: data.id,
    p_detail: { transaction_key: key, computed_total: computed, adjusted_total: adjusted, ratio, reason },
  });
  return NextResponse.json({ ok: true, id: data.id, computed_total: computed, ratio });
}
