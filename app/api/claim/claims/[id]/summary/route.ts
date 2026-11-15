import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadClaimBundle, validateClaim } from "@/lib/claim-server";
import { CLAIM_STATUS_LABELS, MONTH_NAMES } from "@/lib/claim";

/**
 * CSV Submission Summary (revisi 1.0.1 D.4): ringkasan pengajuan klaim +
 * checklist kelengkapan dokumen + daftar data yang belum tersedia.
 * GET murni (idempoten) — mengunduh ulang TIDAK membuat pengajuan ganda.
 * UTF-8 dengan BOM agar terbaca benar di spreadsheet; semua nilai lolos
 * sanitasi formula injection (sel diawali = + - @ diberi prefiks ').
 */
function esc(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^\s*[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"';
  return s;
}
const row = (...cells: unknown[]) => cells.map(esc).join(",");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiContext("claim.claim.view");
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const bundle = await loadClaimBundle(supabase, id);
  if (!bundle) return NextResponse.json({ error: "not found" }, { status: 404 });
  const c = bundle.claim as unknown as Record<string, unknown>;
  const claim = bundle.claim;

  const [{ data: vehicle }, { data: regulation }, { data: docTypes }] = await Promise.all([
    supabase.from("claim_vehicle_types").select("name").eq("id", claim.vehicle_type_id).single(),
    supabase.from("claim_regulation_versions").select("title").eq("id", claim.regulation_version_id).single(),
    supabase.from("claim_document_types").select("id, code, name"),
  ]);
  const docTypeName = new Map((docTypes ?? []).map((d) => [d.id, d.name]));
  const validation = await validateClaim(supabase, id);
  const num = (k: string) => Number(c[k] ?? 0);
  const createdAt = c.created_at
    ? new Date(String(c.created_at)).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : "";

  const lines: string[] = [];
  lines.push(row("RINGKASAN PENGAJUAN KLAIM SUBSIDI — FIMO TRANS JOGJA"));
  lines.push(row("Nomor Pengajuan", claim.claim_number));
  lines.push(row("Operator", claim.operator_name));
  lines.push(row("Penanggung Jawab (PIC)", `${claim.pic_name} — ${claim.pic_position}`));
  lines.push(row("Periode", `${MONTH_NAMES[claim.period_month - 1]} ${claim.period_year}`));
  lines.push(row("Jenis Kendaraan", vehicle?.name ?? ""));
  lines.push(row("Regulasi", regulation?.title ?? ""));
  lines.push(row("Status", CLAIM_STATUS_LABELS[claim.status] ?? claim.status));
  lines.push(row("Versi Pengajuan", claim.current_version));
  lines.push(row("Tanggal Dibuat", createdAt));
  lines.push(row("Ringkasan Dibuat", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })));
  lines.push("");
  lines.push(row("RINGKASAN BIAYA (Rp)"));
  lines.push(row("Biaya Langsung", num("total_direct_cost")));
  lines.push(row("Biaya Tidak Langsung", num("total_indirect_cost")));
  lines.push(row("Biaya Dasar", num("total_base_cost")));
  lines.push(row("Keuntungan", num("total_profit")));
  lines.push(row("Biaya Pendukung", num("total_supporting_cost")));
  lines.push(row("Biaya Operasional", num("total_operational_cost")));
  lines.push(row("Pendapatan", num("total_revenue")));
  lines.push(row("Subsidi Diajukan", num("calculated_subsidy")));
  lines.push("");
  lines.push(row("CHECKLIST KELENGKAPAN DOKUMEN"));
  lines.push(row("Kode", "Komponen Biaya", "Dokumen", "Wajib", "Status"));
  const items = [...bundle.items].sort((a, b) =>
    a.category.code.localeCompare(b.category.code, undefined, { numeric: true }),
  );
  for (const item of items) {
    if (Number(item.nominal_base) <= 0) continue;
    const reqs = bundle.requirements.filter((r) => r.cost_category_id === item.cost_category_id);
    for (const r of reqs) {
      const uploaded = bundle.documents.some(
        (d) => d.claim_item_id === item.id && d.document_type_id === r.document_type_id && d.storage_path,
      );
      lines.push(row(
        item.category.code,
        item.category.name,
        docTypeName.get(r.document_type_id) ?? "Dokumen",
        r.is_mandatory ? "Ya" : "Tidak",
        uploaded ? "Sudah diunggah" : "Belum diunggah",
      ));
    }
  }
  lines.push("");
  lines.push(row("DATA YANG BELUM TERSEDIA"));
  if (validation.itemIssues.length === 0 && validation.warnings.length === 0) {
    lines.push(row("Tidak ada — seluruh checklist dokumen terunggah."));
  } else {
    for (const issue of validation.itemIssues) {
      lines.push(row(`${issue.code} ${issue.name}`, `Dokumen belum diunggah: ${issue.missingDocs.join("; ")}`));
    }
    for (const w of validation.warnings) {
      if (!w.includes("dokumen bukti")) lines.push(row("Catatan", w));
    }
  }
  if (validation.blockingErrors.length > 0) {
    lines.push("");
    lines.push(row("SYARAT WAJIB BELUM TERPENUHI"));
    for (const e of validation.blockingErrors) lines.push(row(e));
  }

  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n"; // awalan = BOM UTF-8 untuk spreadsheet
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ringkasan-${claim.claim_number}.csv"`,
    },
  });
}
