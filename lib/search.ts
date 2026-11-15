// lib/search.ts — pencarian global lintas modul (sadar izin).
//
// Satu kata kunci dicari ke semua modul yang boleh DIBACA akun yang sedang
// login (matriks Fase 1: moduleAccess.<modul>.read; superadmin membaca semua).
// Query memakai klien sesi, jadi RLS ikut menegakkan di level database.
// Hasil dikelompokkan per modul; setiap hasil menautkan ke halaman modulnya
// (memakai filter ?q= halaman itu bila tersedia).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth";
import { APPLICATIONS, DOCUMENTS } from "@/components/workspace/catalog";
import { workspaceShortcutVisible } from "@/lib/module-access";

export interface SearchHit {
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchGroup {
  key: string;
  label: string;
  hits: SearchHit[];
}

const LIMIT = 8;

function like(q: string): string {
  // Bungkus sebagai pola ilike; netralkan wildcard dari input user.
  return `%${q.replace(/[%_\\]/g, " ").trim()}%`;
}

export async function searchAll(
  supabase: SupabaseClient,
  ctx: SessionContext,
  rawQuery: string,
): Promise<SearchGroup[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const pattern = like(q);
  const groups: SearchGroup[] = [];
  const can = (module: string) =>
    ctx.roles.includes("superadmin") ||
    Boolean((ctx.moduleAccess as Record<string, { read?: boolean } | undefined>)[module]?.read);

  if (can("branding")) {
    const [buses, bookings, bookingsByBus, notas, records] = await Promise.all([
      supabase
        .from("branding_buses")
        .select("no_polisi, fleet_no, hull_no, route, bus_type")
        .or(`no_polisi.ilike.${pattern},fleet_no.ilike.${pattern},hull_no.ilike.${pattern},route.ilike.${pattern}`)
        .limit(LIMIT),
      supabase
        .from("branding_bookings")
        .select("brand_name, company_name, status, branding_buses(no_polisi)")
        .or(`brand_name.ilike.${pattern},company_name.ilike.${pattern}`)
        .limit(LIMIT),
      (async () => {
        const { data: busHits } = await supabase
          .from("branding_buses")
          .select("id")
          .or(`no_polisi.ilike.${pattern},fleet_no.ilike.${pattern},hull_no.ilike.${pattern}`)
          .limit(20);
        const ids = (busHits ?? []).map((b) => b.id);
        if (!ids.length) return { data: [] as unknown[] };
        return supabase
          .from("branding_bookings")
          .select("brand_name, company_name, status, branding_buses(no_polisi)")
          .in("bus_id", ids)
          .limit(LIMIT);
      })(),
      supabase
        .from("branding_nota_dinas")
        .select("number, status")
        .ilike("number", pattern)
        .limit(LIMIT),
      supabase
        .from("branding_admin_records")
        .select("brand_name, company_name")
        .or(`brand_name.ilike.${pattern},company_name.ilike.${pattern}`)
        .limit(LIMIT),
    ]);

    const busHits: SearchHit[] = (buses.data ?? []).map((b) => ({
      title: `Bus ${b.no_polisi}`,
      subtitle: [b.fleet_no ? `Lambung ${b.fleet_no}` : b.hull_no ? `Hull ${b.hull_no}` : null, b.route, b.bus_type]
        .filter(Boolean)
        .join(" · "),
      href: `/branding/buses?q=${encodeURIComponent(b.no_polisi)}`,
    }));
    if (busHits.length) groups.push({ key: "buses", label: "Armada Branding", hits: busHits });

    const seenBooking = new Set<string>();
    const bookingHits: SearchHit[] = [];
    for (const b of [...((bookings.data ?? []) as Record<string, unknown>[]), ...((bookingsByBus.data ?? []) as Record<string, unknown>[])]) {
      const bus = b.branding_buses as { no_polisi?: string } | null;
      const key = `${b.brand_name}|${bus?.no_polisi ?? ""}`;
      if (seenBooking.has(key)) continue;
      seenBooking.add(key);
      bookingHits.push({
        title: String(b.brand_name ?? "Booking"),
        subtitle: [b.company_name, bus?.no_polisi, b.status].filter(Boolean).join(" · "),
        href: `/branding/bookings?q=${encodeURIComponent(q)}`,
      });
      if (bookingHits.length >= LIMIT) break;
    }
    if (bookingHits.length) groups.push({ key: "bookings", label: "Booking Branding", hits: bookingHits });

    const notaHits: SearchHit[] = (notas.data ?? []).map((n) => ({
      title: `Nota Dinas ${n.number}`,
      subtitle: n.status ?? undefined,
      href: "/branding/documents",
    }));
    if (notaHits.length) groups.push({ key: "nota", label: "Nota Dinas", hits: notaHits });

    const recordHits: SearchHit[] = (records.data ?? []).map((r) => ({
      title: r.brand_name,
      subtitle: r.company_name ?? undefined,
      href: "/branding/documents",
    }));
    if (recordHits.length) groups.push({ key: "records", label: "Administrasi Branding", hits: recordHits });
  }

  if (can("claim")) {
    const { data } = await supabase
      .from("claims")
      .select("id, claim_number, status, operator_name")
      .or(`claim_number.ilike.${pattern},operator_name.ilike.${pattern}`)
      .limit(LIMIT);
    const hits: SearchHit[] = (data ?? []).map((c) => ({
      title: `Klaim ${c.claim_number}`,
      subtitle: [c.operator_name, c.status].filter(Boolean).join(" · "),
      href: `/claim/${c.id}`,
    }));
    if (hits.length) groups.push({ key: "claims", label: "Klaim Subsidi", hits });
  }

  if (can("spm")) {
    const [findings, rates] = await Promise.all([
      supabase
        .from("spm_findings")
        .select("fleet_no, violation_code, status, occurred_date")
        .or(`fleet_no.ilike.${pattern},violation_code.ilike.${pattern}`)
        .limit(LIMIT),
      supabase
        .from("spm_violation_rates")
        .select("kode_pelanggaran, deskripsi_pelanggaran")
        .or(`kode_pelanggaran.ilike.${pattern},deskripsi_pelanggaran.ilike.${pattern}`)
        .limit(LIMIT),
    ]);
    const findingHits: SearchHit[] = (findings.data ?? []).map((f) => ({
      title: `Temuan ${f.fleet_no} · ${f.violation_code}`,
      subtitle: [f.occurred_date, f.status].filter(Boolean).join(" · "),
      href: "/spm/reconciliation",
    }));
    if (findingHits.length) groups.push({ key: "spm-findings", label: "Temuan SPM", hits: findingHits });
    const rateHits: SearchHit[] = (rates.data ?? []).map((r) => ({
      title: `Tarif ${r.kode_pelanggaran}`,
      subtitle: r.deskripsi_pelanggaran ?? undefined,
      href: "/spm/rates",
    }));
    if (rateHits.length) groups.push({ key: "spm-rates", label: "Tarif SPM", hits: rateHits });
  }

  if (can("workspace")) {
    const needle = q.toLowerCase();
    const appHits: SearchHit[] = APPLICATIONS.filter(
      (a) => workspaceShortcutVisible(ctx.featureAccess, "app", a.icon) && (a.name.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle)),
    )
      .slice(0, LIMIT)
      .map((a) => ({ title: a.name, subtitle: a.category, href: "/workspace/applications" }));
    const docHits: SearchHit[] = DOCUMENTS.filter(
      (d) => workspaceShortcutVisible(ctx.featureAccess, "drive", d.slug) && (d.title.toLowerCase().includes(needle) || d.description.toLowerCase().includes(needle)),
    )
      .slice(0, LIMIT)
      .map((d) => ({ title: d.title, subtitle: d.category, href: "/workspace/drive" }));
    const hits = [...appHits, ...docHits];
    if (hits.length) groups.push({ key: "workspace", label: "Workspace", hits });
  }

  if (ctx.permissions.includes("platform.users.view")) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .limit(LIMIT);
    const hits: SearchHit[] = (data ?? []).map((p) => ({
      title: p.display_name || p.username,
      subtitle: `@${p.username}`,
      href: `/admin/users/${p.id}`,
    }));
    if (hits.length) groups.push({ key: "users", label: "Pengguna", hits });
  }

  return groups;
}

/* ================= Spotlight entitas bus ================= */

export interface BusSpotlight {
  bus: {
    no_polisi: string;
    fleet_no: string | null;
    hull_no: string | null;
    route: string | null;
    bus_type: string | null;
    color: string | null;
    body_maker: string | null;
  };
  bookings: {
    brand_name: string;
    company_name: string | null;
    status: string;
    start_date: string;
    end_date: string;
  }[];
}

/**
 * Bila kata kunci menunjuk SATU bus secara meyakinkan (nopol persis,
 * nomor lambung persis, atau hanya satu kandidat), kembalikan data
 * lengkap bus itu + booking-nya untuk ditampilkan sebagai kartu
 * sorotan — pencarian "menandai" itemnya dan menunjukkan datanya,
 * bukan sekadar memfilter daftar.
 */
export async function searchBusSpotlight(
  supabase: SupabaseClient,
  ctx: SessionContext,
  rawQuery: string,
): Promise<BusSpotlight | null> {
  const q = rawQuery.trim();
  if (q.length < 2) return null;
  const canBranding =
    ctx.roles.includes("superadmin") ||
    Boolean((ctx.moduleAccess as Record<string, { read?: boolean } | undefined>).branding?.read);
  if (!canBranding) return null;

  const pattern = like(q);
  const { data: candidates } = await supabase
    .from("branding_buses")
    .select("id, no_polisi, fleet_no, hull_no, route, bus_type, color, body_maker")
    .or(`no_polisi.ilike.${pattern},fleet_no.ilike.${pattern},hull_no.ilike.${pattern},route.ilike.${pattern}`)
    .limit(5);
  if (!candidates?.length) return null;

  const norm = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const nq = norm(q);
  const exact = candidates.find((b) => norm(b.no_polisi) === nq || norm(b.fleet_no) === nq || norm(b.hull_no) === nq);
  const chosen = exact ?? (candidates.length === 1 ? candidates[0] : null);
  if (!chosen) return null;

  const { data: bookings } = await supabase
    .from("branding_bookings")
    .select("brand_name, company_name, status, start_date, end_date")
    .eq("bus_id", chosen.id)
    .order("start_date", { ascending: false })
    .limit(5);

  return {
    bus: {
      no_polisi: chosen.no_polisi,
      fleet_no: chosen.fleet_no,
      hull_no: chosen.hull_no,
      route: chosen.route,
      bus_type: chosen.bus_type,
      color: chosen.color,
      body_maker: chosen.body_maker,
    },
    bookings: bookings ?? [],
  };
}
