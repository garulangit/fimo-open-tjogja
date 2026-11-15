import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiContext } from "@/lib/auth";
import { calculateClaimTotals, calculateItemFinancials, REVENUE_FORM_ROWS } from "@/lib/claim";
import { loadClaimBundle, recalcClaim, recalcVerifiedClaim, validateClaim } from "@/lib/claim-server";

const EDITABLE = ["DRAFT", "REVISION_REQUIRED"];

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const form = await request.formData();
  const action = String(form.get("_action") ?? "");
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const back = (p: string) => NextResponse.redirect(new URL(p, BASE), 303);
  const detail = (q: string) => back(`/claim/${id}?${q}`);
  const supabase = await createClient();
  const bundle = await loadClaimBundle(supabase, id);
  if (!bundle) return detail("err=" + encodeURIComponent("Klaim tidak ditemukan."));
  const claim = bundle.claim;

  const permByAction: Record<string, string> = {
    meta: "claim.claim.edit", items: "claim.claim.edit", revenues: "claim.claim.edit",
    submit: "claim.claim.submit", review: "claim.claim.verify", verified: "claim.claim.verify", delete: "claim.claim.delete",
  };
  const actx = await apiContext(permByAction[action] ?? "claim.claim.view");
  if (!actx) return detail("err=" + encodeURIComponent("Tidak memiliki izin untuk aksi ini."));

  if (action === "meta") {
    if (!EDITABLE.includes(claim.status))
      return detail("err=" + encodeURIComponent("Data klaim terkunci pada status ini."));
    const { error } = await supabase.from("claims").update({
      operator_name: s("operator_name"), pic_name: s("pic_name"), pic_position: s("pic_position"),
      notes: s("notes") || null, profit_percentage: Number(s("profit_percentage") || 7),
      updated_by: actx.userId,
    }).eq("id", id);
    if (error) return detail("err=" + encodeURIComponent("Gagal menyimpan: " + error.message));
    const recalculated = await recalcClaim(supabase, id);
    if (!recalculated)
      return detail("err=" + encodeURIComponent("Data klaim tersimpan, tetapi hitung ulang total GAGAL — muat ulang halaman dan periksa total sebelum melanjutkan."));
    return detail("ok=" + encodeURIComponent("Data klaim diperbarui."));
  }

  if (action === "items") {
    if (!EDITABLE.includes(claim.status))
      return detail("err=" + encodeURIComponent("Item terkunci pada status ini."));
    // Tulis MASSAL, bukan satu panggilan per item. Akar cacat pilot
    // CLM-D-2026-0002 terverifikasi di staging: versi lama memperbarui
    // 52 item dengan 52 panggilan basis data berurutan dalam SATU
    // request — panggilan di ekor antrean gagal (anggaran subrequest
    // per request pada platform Workers) dan galatnya diabaikan, jadi
    // nilai hilang diam-diam. Sekarang: validasi semua nilai lebih dulu
    // (satu nilai rusak = seluruh simpan ditolak dengan galat jelas dan
    // tidak ada yang tertulis), lalu SATU upsert massal, lalu
    // verifikasi pasca-tulis sebelum berani menyatakan sukses.
    const codeOf = new Map(bundle.items.map((i) => [i.id, i.category.code]));
    const intended = new Map<string, { nominal: number; taxType: string; taxRate: number; calcTax: number; calcTotal: number }>();
    const invalid: string[] = [];
    for (const item of bundle.items) {
      const nominal = Number(form.get(`nominal_${item.id}`) ?? item.nominal_base);
      const taxType = s(`taxtype_${item.id}`) || item.tax_type;
      const taxRate = Number(form.get(`taxrate_${item.id}`) ?? item.tax_rate);
      if (!Number.isFinite(nominal) || nominal < 0 || !Number.isFinite(taxRate)) {
        invalid.push(item.category.code);
        continue;
      }
      const calc = calculateItemFinancials(nominal, taxType, taxRate);
      intended.set(item.id, {
        nominal, taxType, taxRate: calc.taxRate,
        calcTax: calc.calculatedTax, calcTotal: calc.calculatedTotal,
      });
    }
    if (invalid.length > 0)
      return detail("err=" + encodeURIComponent(
        `Simpan ditolak: nilai tidak valid pada ${invalid.length} item (kode: ${invalid.join(", ")}). ` +
        "Tidak ada nilai yang diubah — perbaiki isian item tersebut lalu simpan lagi.",
      ));
    const rows = bundle.items
      .filter((item) => intended.has(item.id))
      .map((item) => {
        const w = intended.get(item.id)!;
        return {
          id: item.id, claim_id: id, cost_category_id: item.cost_category_id,
          nominal_base: w.nominal, tax_type: w.taxType, tax_rate: w.taxRate,
          calculated_tax: w.calcTax, calculated_total: w.calcTotal,
        };
      });
    if (rows.length > 0) {
      const { error } = await supabase.from("claim_items").upsert(rows, { onConflict: "id" });
      if (error)
        return detail("err=" + encodeURIComponent(
          "Gagal menyimpan item biaya: " + error.message +
          " — muat ulang halaman untuk memeriksa nilai yang tersimpan, lalu coba lagi.",
        ));
    }
    // Verifikasi pasca-tulis: baca ulang seluruh item dan cocokkan dengan
    // nilai yang dimaksud. Selisih apa pun = simpan gagal, laporkan sebagai
    // galat, jangan pernah tampilkan sukses.
    const { data: stored, error: verifyError } = await supabase
      .from("claim_items")
      .select("id, nominal_base, tax_type, tax_rate, calculated_tax, calculated_total")
      .eq("claim_id", id);
    if (verifyError)
      return detail("err=" + encodeURIComponent("Item terkirim tetapi verifikasi penyimpanan gagal: " + verifyError.message));
    const mismatches: string[] = [];
    const storedById = new Map((stored ?? []).map((r) => [r.id, r]));
    for (const [itemId, want] of intended) {
      const row = storedById.get(itemId);
      if (!row || Number(row.nominal_base) !== want.nominal || row.tax_type !== want.taxType
        || Number(row.tax_rate) !== want.taxRate || Number(row.calculated_tax) !== want.calcTax
        || Number(row.calculated_total) !== want.calcTotal)
        mismatches.push(codeOf.get(itemId) ?? itemId);
    }
    if (mismatches.length > 0)
      return detail("err=" + encodeURIComponent(
        `Verifikasi gagal: ${mismatches.length} item tidak tersimpan sesuai nilai yang diisi (kode: ${mismatches.join(", ")}). ` +
        "Muat ulang halaman untuk melihat nilai yang benar-benar tersimpan, lalu coba lagi.",
      ));
    const recalculated = await recalcClaim(supabase, id);
    if (!recalculated)
      return detail("err=" + encodeURIComponent(
        "Item biaya tersimpan, tetapi hitung ulang total klaim GAGAL — total ringkasan belum dapat dipercaya. Muat ulang halaman; bila masih gagal, jangan ajukan klaim ini.",
      ));
    return detail("ok=" + encodeURIComponent("Item biaya disimpan & total dihitung ulang."));
  }

  if (action === "revenues") {
    if (!EDITABLE.includes(claim.status))
      return detail("err=" + encodeURIComponent("Pendapatan terkunci pada status ini."));
    const rows: Array<{ claim_id: string; revenue_code: string; revenue_name: string; category: string; nominal: number }> = [];
    for (let i = 0; i < REVENUE_FORM_ROWS; i++) {
      const code = s(`rev_code_${i}`);
      if (!code) continue;
      rows.push({
        claim_id: id, revenue_code: code,
        revenue_name: s(`rev_name_${i}`) || code,
        category: s(`rev_cat_${i}`) === "BRANDING" ? "BRANDING" : "TICKET",
        nominal: Number(form.get(`rev_nominal_${i}`) ?? 0),
      });
    }
    const { error: deleteError } = await supabase.from("claim_revenues").delete().eq("claim_id", id);
    if (deleteError) return detail("err=" + encodeURIComponent("Gagal menyimpan pendapatan: " + deleteError.message));
    if (rows.length) {
      const { error } = await supabase.from("claim_revenues").insert(rows);
      if (error) return detail("err=" + encodeURIComponent("Gagal menyimpan pendapatan: " + error.message));
    }
    const recalculated = await recalcClaim(supabase, id);
    if (!recalculated)
      return detail("err=" + encodeURIComponent("Pendapatan tersimpan, tetapi hitung ulang total GAGAL — muat ulang halaman dan periksa total sebelum melanjutkan."));
    return detail("ok=" + encodeURIComponent("Pendapatan disimpan."));
  }

  if (action === "submit") {
    if (!EDITABLE.includes(claim.status))
      return detail("err=" + encodeURIComponent("Klaim tidak dalam status yang dapat diajukan."));
    const validation = await validateClaim(supabase, id);
    if (!validation.isValid)
      return detail("err=" + encodeURIComponent("Pengajuan ditolak: " + validation.blockingErrors.join(" ")));
    const fresh = await loadClaimBundle(supabase, id);
    const wasRevision = claim.status === "REVISION_REQUIRED";
    const nextVersion = Number(claim.current_version) + (wasRevision ? 1 : 0);
    const snapshot = {
      claim: fresh?.claim, items: fresh?.items, revenues: fresh?.revenues,
      submitted_by: actx.displayName, submitted_at: new Date().toISOString(),
    };
    const { error: vErr } = await supabase.from("claim_versions").insert({
      claim_id: id, version_number: nextVersion, snapshot_json: snapshot,
      revision_reason: s("revision_reason") || (wasRevision ? "Revisi diajukan kembali" : "Pengajuan awal"),
      created_by: actx.userId,
    });
    if (vErr) return detail("err=" + encodeURIComponent("Gagal membuat snapshot versi: " + vErr.message));
    if (wasRevision) {
      // Pengajuan ulang = putaran verifikasi baru: nilai terverifikasi
      // putaran sebelumnya dibersihkan (snapshot versi di atas sudah
      // menyimpannya untuk jejak audit) agar angka dicairkan yang basi
      // tidak menempel pada versi baru.
      const { error: riErr } = await supabase.from("claim_items")
        .update({ verified_amount: null }).eq("claim_id", id);
      if (riErr) return detail("err=" + encodeURIComponent("Gagal membersihkan nilai terverifikasi lama: " + riErr.message));
      const { error: rrErr } = await supabase.from("claim_revenues")
        .update({ verified_amount: null }).eq("claim_id", id);
      if (rrErr) return detail("err=" + encodeURIComponent("Gagal membersihkan nilai terverifikasi lama: " + rrErr.message));
    }
    const { error } = await supabase.from("claims")
      .update({
        status: "IN_REVIEW", current_version: nextVersion, updated_by: actx.userId,
        ...(wasRevision
          ? { total_verified_operational_cost: null, calculated_verified_subsidy: null, verified_at: null }
          : {}),
      })
      .eq("id", id);
    if (error) return detail("err=" + encodeURIComponent("Gagal mengajukan: " + error.message));
    await supabase.rpc("log_audit", {
      p_module: "claim", p_action: "claim.submit", p_entity_type: "claim",
      p_entity_id: id,
      p_detail: {
        claim_number: claim.claim_number, version: nextVersion,
        dokumen_kurang: validation.itemIssues.reduce((s, i) => s + i.missing, 0),
      },
    });
    // summary=1: halaman detail otomatis mengunduh CSV ringkasan pengajuan (D.4).
    return detail("ok=" + encodeURIComponent(`Klaim versi ${nextVersion} diajukan untuk verifikasi.`) + "&summary=1");
  }

  if (action === "verified") {
    // Nilai terverifikasi (yang dicairkan) per item & pendapatan — hanya
    // saat IN_REVIEW, hanya pemegang izin claim.claim.verify (dipetakan di
    // permByAction). Pola yang sama dengan simpan item v1.1.5: validasi
    // semua nilai di depan, SATU upsert massal per tabel, verifikasi
    // pasca-tulis, hitung ulang total terverifikasi — galat apa pun
    // dilaporkan, tidak ada sukses diam-diam. Nilai usulan tidak ditimpa.
    if (claim.status !== "IN_REVIEW")
      return detail("err=" + encodeURIComponent("Nilai terverifikasi hanya dapat diisi saat klaim berstatus Dalam Verifikasi (IN_REVIEW)."));
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const codeOf = new Map(bundle.items.map((i) => [i.id, i.category.code]));
    const itemValues = new Map<string, number>();
    const invalid: string[] = [];
    for (const item of bundle.items) {
      const raw = form.get(`verified_${item.id}`);
      const v = raw === null ? Number(item.verified_amount ?? item.calculated_total) : Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > Number(item.calculated_total) + 0.005) {
        invalid.push(item.category.code);
        continue;
      }
      itemValues.set(item.id, round2(v));
    }
    const revValues = new Map<string, number>();
    const invalidRev: string[] = [];
    for (const rev of bundle.revenues) {
      const raw = form.get(`verified_rev_${rev.id}`);
      const v = raw === null ? Number(rev.verified_amount ?? rev.nominal) : Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > Number(rev.nominal) + 0.005) {
        invalidRev.push(rev.revenue_name);
        continue;
      }
      revValues.set(rev.id, round2(v));
    }
    if (invalid.length > 0 || invalidRev.length > 0)
      return detail("err=" + encodeURIComponent(
        "Simpan terverifikasi ditolak: nilai harus antara 0 dan nilai Usulan. " +
        (invalid.length ? `Item bermasalah: ${invalid.join(", ")}. ` : "") +
        (invalidRev.length ? `Pendapatan bermasalah: ${invalidRev.join(", ")}. ` : "") +
        "Tidak ada nilai yang diubah.",
      ));
    const itemRows = bundle.items
      .filter((item) => itemValues.has(item.id))
      .map((item) => ({
        id: item.id, claim_id: id, cost_category_id: item.cost_category_id,
        verified_amount: itemValues.get(item.id)!,
      }));
    if (itemRows.length > 0) {
      const { error } = await supabase.from("claim_items").upsert(itemRows, { onConflict: "id" });
      if (error)
        return detail("err=" + encodeURIComponent("Gagal menyimpan nilai terverifikasi item: " + error.message));
    }
    const revRows = bundle.revenues
      .filter((rev) => revValues.has(rev.id))
      .map((rev) => ({
        id: rev.id, claim_id: id, revenue_code: rev.revenue_code,
        revenue_name: rev.revenue_name, category: rev.category, nominal: rev.nominal,
        verified_amount: revValues.get(rev.id)!,
      }));
    if (revRows.length > 0) {
      const { error } = await supabase.from("claim_revenues").upsert(revRows, { onConflict: "id" });
      if (error)
        return detail("err=" + encodeURIComponent("Gagal menyimpan nilai terverifikasi pendapatan: " + error.message));
    }
    // Verifikasi pasca-tulis kedua tabel.
    const [{ data: storedItems, error: e1 }, { data: storedRevs, error: e2 }] = await Promise.all([
      supabase.from("claim_items").select("id, verified_amount").eq("claim_id", id),
      supabase.from("claim_revenues").select("id, verified_amount").eq("claim_id", id),
    ]);
    if (e1 || e2)
      return detail("err=" + encodeURIComponent("Nilai terverifikasi terkirim tetapi verifikasi penyimpanan gagal: " + (e1?.message ?? e2?.message ?? "")));
    const mismatches: string[] = [];
    const sItems = new Map((storedItems ?? []).map((r) => [r.id, Number(r.verified_amount)]));
    for (const [itemId, want] of itemValues)
      if (sItems.get(itemId) !== want) mismatches.push(codeOf.get(itemId) ?? itemId);
    const sRevs = new Map((storedRevs ?? []).map((r) => [r.id, Number(r.verified_amount)]));
    for (const [revId, want] of revValues) {
      if (sRevs.get(revId) !== want) {
        const rev = bundle.revenues.find((r) => r.id === revId);
        mismatches.push(rev ? `pendapatan ${rev.revenue_name}` : revId);
      }
    }
    if (mismatches.length > 0)
      return detail("err=" + encodeURIComponent(
        `Verifikasi gagal: ${mismatches.length} nilai tidak tersimpan sesuai isian (${mismatches.join(", ")}). Muat ulang halaman untuk melihat nilai yang benar-benar tersimpan, lalu coba lagi.`,
      ));
    const recalculated = await recalcVerifiedClaim(supabase, id);
    if (!recalculated)
      return detail("err=" + encodeURIComponent("Nilai terverifikasi tersimpan, tetapi hitung ulang total terverifikasi GAGAL — total ringkasan belum dapat dipercaya. Muat ulang halaman dan periksa sebelum menyetujui klaim ini."));
    const vTotals = calculateClaimTotals(
      bundle.items.map((i) => ({ categoryType: i.category.category_type, calculatedTotal: itemValues.get(i.id) ?? 0 })),
      bundle.revenues.map((r) => ({ category: r.category, nominal: revValues.get(r.id) ?? 0 })),
      Number(claim.profit_percentage),
    );
    await supabase.rpc("log_audit", {
      p_module: "claim", p_action: "claim.verified_save", p_entity_type: "claim",
      p_entity_id: id,
      p_detail: {
        claim_number: claim.claim_number,
        verified_operational: vTotals.totalOperationalCost,
        verified_subsidy: vTotals.calculatedSubsidy,
      },
    });
    return detail("ok=" + encodeURIComponent("Nilai terverifikasi disimpan & total terverifikasi dihitung ulang."));
  }

  if (action === "review") {
    const reviewAction = s("review_action");
    const notes = s("review_notes");
    const needsApprove = reviewAction === "APPROVE" || reviewAction === "COMPLETE";
    if (needsApprove && !actx.permissions.includes("claim.claim.approve"))
      return detail("err=" + encodeURIComponent("Aksi ini butuh izin claim.claim.approve."));
    const transitions: Record<string, { from: string; to: string }> = {
      APPROVE: { from: "IN_REVIEW", to: "APPROVED" },
      REQUEST_REVISION: { from: "IN_REVIEW", to: "REVISION_REQUIRED" },
      REJECT: { from: "IN_REVIEW", to: "REJECTED" },
      COMPLETE: { from: "APPROVED", to: "COMPLETED" },
    };
    const t = transitions[reviewAction];
    if (!t) return detail("err=" + encodeURIComponent("Aksi review tidak dikenal."));
    if (claim.status !== t.from)
      return detail("err=" + encodeURIComponent(`Aksi ${reviewAction} hanya dari status ${t.from}.`));
    const newNotes = notes
      ? `${claim.notes ? claim.notes + "\n" : ""}[Catatan Verifikator]: ${notes}`
      : claim.notes;
    const { error } = await supabase.from("claims")
      .update({ status: t.to, notes: newNotes, updated_by: actx.userId }).eq("id", id);
    if (error) return detail("err=" + encodeURIComponent("Gagal memproses review: " + error.message));
    await supabase.rpc("log_audit", {
      p_module: "claim", p_action: "claim.review", p_entity_type: "claim",
      p_entity_id: id, p_detail: { action: reviewAction, from: t.from, to: t.to },
    });
    return detail("ok=" + encodeURIComponent(`Status klaim: ${t.to}.`));
  }

  if (action === "delete") {
    if (!EDITABLE.includes(claim.status))
      return detail("err=" + encodeURIComponent("Hanya klaim Draft/Perlu Revisi yang dapat dihapus."));
    const { data: docRows } = await supabase
      .from("claim_item_documents").select("storage_path, storage_backend").eq("claim_id", id);
    const byBackend = new Map<string, string[]>();
    for (const d of docRows ?? []) {
      if (!d.storage_path) continue;
      const b = d.storage_backend === "minio" ? "minio" : "supabase";
      byBackend.set(b, [...(byBackend.get(b) ?? []), d.storage_path]);
    }
    const { storageRemove } = await import("@/lib/storage");
    for (const [b, ps] of byBackend)
      await storageRemove(b as "supabase" | "minio", "claim-docs", ps);
    const { error } = await supabase.from("claims").delete().eq("id", id);
    if (error) return detail("err=" + encodeURIComponent("Gagal menghapus: " + error.message));
    await supabase.rpc("log_audit", {
      p_module: "claim", p_action: "claim.delete", p_entity_type: "claim",
      p_entity_id: null, p_detail: { claim_number: claim.claim_number },
    });
    return back("/claim/list?ok=" + encodeURIComponent(`Klaim ${claim.claim_number} dihapus.`));
  }

  return detail("err=" + encodeURIComponent("Aksi tidak dikenal."));
}
