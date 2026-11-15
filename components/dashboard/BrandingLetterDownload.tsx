"use client";

import { useState } from "react";
import { FileText, ScrollText } from "lucide-react";
import JSZip from "@/lib/vendor/jszip";

type Member = {
  noPolisi: string | null;
  busType: string | null;
  placement: string;
  startDate: string;
  endDate: string;
  duration: number;
  pricing: { mediaBus?: string; basePrice?: number; ppn?: number; totalWithPpn?: number } | null;
};
type PricingEntry = { mediaBus: string; spaceIklan: string; durations: Record<string, number> };
type LetterData = {
  kind: "penawaran" | "konfirmasi";
  reference: string | null;
  company: string;
  letterDate: string;
  members: Member[];
  pricing: { entries: PricingEntry[]; ppnEnabled: boolean; ppnPercent: number } | null;
};

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const rupiahNumber = (value: number | undefined) => value == null ? "-" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
const rupiah = (value: number | undefined) => value == null ? "-" : `Rp.${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
const placementName: Record<string, string> = { FULL_BODY: "Full Body", SIDE_BODY: "Full Body (Kiri + Kanan)", BACK_BODY: "Back Body" };
const monthName: Record<string, string> = { "1": "1 Bulan", "3": "3 Bulan", "6": "6 Bulan", "12": "12 Bulan" };

function textOf(element: Element) {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, "t"), (text) => text.textContent ?? "").join("");
}

function setParagraphText(paragraph: Element, value: string) {
  const nodes = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "t"));
  if (!nodes.length) {
    const run = paragraph.ownerDocument!.createElementNS(WORD_NS, "w:r");
    const text = paragraph.ownerDocument!.createElementNS(WORD_NS, "w:t");
    text.textContent = value;
    run.append(text);
    paragraph.append(run);
    return;
  }
  nodes[0].textContent = value;
  if (value.startsWith(" ") || value.endsWith(" ")) nodes[0].setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  for (const node of nodes.slice(1)) node.textContent = "";
}

function setCellText(cell: Element, value: string) {
  const paragraphs = Array.from(cell.getElementsByTagNameNS(WORD_NS, "p"));
  if (!paragraphs.length) return;
  setParagraphText(paragraphs[0], value);
  for (const paragraph of paragraphs.slice(1)) setParagraphText(paragraph, "");
}

function setRowCells(row: Element, values: string[]) {
  const cells = Array.from(row.children).filter((element) => element.localName === "tc");
  cells.forEach((cell, index) => setCellText(cell, values[index] ?? ""));
}

function updateConfirmationTable(doc: Document, data: LetterData) {
  const tables = Array.from(doc.getElementsByTagNameNS(WORD_NS, "tbl"));
  const table = tables.find((candidate) => textOf(candidate).includes("{{BUS_TYPE}}"));
  if (!table) throw new Error("Template konfirmasi tidak memiliki tabel rincian armada.");
  const rows = Array.from(table.getElementsByTagNameNS(WORD_NS, "tr"));
  const detail = rows.find((row) => textOf(row).includes("{{BUS_TYPE}}"));
  const ppnRow = rows.find((row) => textOf(row).includes("{{PPN_TOTAL}}"));
  const totalRow = rows.find((row) => textOf(row).includes("{{GRAND_TOTAL}}"));
  const wordsRow = rows.find((row) => textOf(row).includes("{{TERBILANG}}"));
  if (!detail || !ppnRow || !totalRow || !wordsRow) throw new Error("Struktur tabel konfirmasi template tidak lengkap.");

  const detailValues = (member: Member, index: number) => {
    const duration = member.duration || Math.max(1, Math.round((Date.parse(member.endDate) - Date.parse(member.startDate)) / (30 * 86400000)) + 1);
    const period = monthName[String(duration)] ?? `${duration} Bulan`;
    return [String(index + 1), member.busType ?? "Angkutan Perkotaan", placementName[member.placement] ?? member.placement,
      "1 Unit", period, rupiah(member.pricing?.basePrice), rupiah(member.pricing?.basePrice)];
  };
  setRowCells(detail, detailValues(data.members[0], 0));
  for (let index = 1; index < data.members.length; index++) {
    const clone = detail.cloneNode(true) as Element;
    setRowCells(clone, detailValues(data.members[index], index));
    table.insertBefore(clone, ppnRow);
  }

  const ppn = data.members.reduce((sum, member) => sum + Number(member.pricing?.ppn ?? 0), 0);
  const total = data.members.reduce((sum, member) => sum + Number(member.pricing?.totalWithPpn ?? 0), 0);
  const ppnCells = Array.from(ppnRow.children).filter((element) => element.localName === "tc");
  const totalCells = Array.from(totalRow.children).filter((element) => element.localName === "tc");
  setCellText(ppnCells.at(-1)!, rupiah(ppn));
  setCellText(totalCells.at(-1)!, rupiah(total));
  const wordsCells = Array.from(wordsRow.children).filter((element) => element.localName === "tc");
  setCellText(wordsCells[0], `Terbilang: ${spellIndonesian(total)} Rupiah`);
}

function spellIndonesian(value: number): string {
  const words = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  const spell = (n: number): string => {
    if (n < 12) return words[n];
    if (n < 20) return `${spell(n - 10)} Belas`;
    if (n < 100) return `${spell(Math.floor(n / 10))} Puluh${n % 10 ? ` ${spell(n % 10)}` : ""}`;
    if (n < 200) return `Seratus${n % 100 ? ` ${spell(n % 100)}` : ""}`;
    if (n < 1000) return `${spell(Math.floor(n / 100))} Ratus${n % 100 ? ` ${spell(n % 100)}` : ""}`;
    if (n < 2000) return `Seribu${n % 1000 ? ` ${spell(n % 1000)}` : ""}`;
    if (n < 1_000_000) return `${spell(Math.floor(n / 1000))} Ribu${n % 1000 ? ` ${spell(n % 1000)}` : ""}`;
    if (n < 1_000_000_000) return `${spell(Math.floor(n / 1_000_000))} Juta${n % 1_000_000 ? ` ${spell(n % 1_000_000)}` : ""}`;
    return `${spell(Math.floor(n / 1_000_000_000))} Miliar${n % 1_000_000_000 ? ` ${spell(n % 1_000_000_000)}` : ""}`;
  };
  return spell(Math.round(Math.abs(value)));
}

function updateOfferTable(doc: Document, data: LetterData) {
  const table = Array.from(doc.getElementsByTagNameNS(WORD_NS, "tbl"))
    .find((candidate) => textOf(candidate).includes("{{SPACE_1}}"));
  if (!table) throw new Error("Template penawaran tidak memiliki tabel harga.");
  const rows = Array.from(table.getElementsByTagNameNS(WORD_NS, "tr"));
  const targets = ["Left Body", "Right Body", "Back Body", "Full Body"];
  const preferredMedia = data.members[0]?.pricing?.mediaBus ?? data.members[0]?.busType ?? "";
  const entries = (data.pricing?.entries ?? []).filter((entry) =>
    entry.mediaBus.trim().toLocaleLowerCase("id-ID") === preferredMedia.trim().toLocaleLowerCase("id-ID"),
  );
  targets.forEach((space, index) => {
    const entry = entries.find((item) => item.spaceIklan.trim().toLocaleLowerCase("id-ID") === space.toLocaleLowerCase("id-ID"));
    const price = (duration: number) => entry?.durations[String(duration)] ?? entry?.durations[`${duration}`];
    const row = rows.find((candidate) => textOf(candidate).includes(`{{SPACE_${index + 1}}}`));
    if (row) {
      const cells = Array.from(row.children).filter((element) => element.localName === "tc");
      setCellText(cells[0], String(index + 1));
      setCellText(cells[2], space);
      [1, 3, 6, 12].forEach((duration, tier) => setCellText(cells[tier + 3], rupiahNumber(price(duration))));
    }
  });
}

function fillCommonFields(doc: Document, data: LetterData) {
  for (const paragraph of Array.from(doc.getElementsByTagNameNS(WORD_NS, "p"))) {
    const text = textOf(paragraph);
    if (text.includes("{{COMPANY}}")) setParagraphText(paragraph, text.replaceAll("{{COMPANY}}", data.company));
    if (text.includes("{{MEDIA}}")) setParagraphText(paragraph, text.replaceAll("{{MEDIA}}", data.members[0]?.busType ?? "Bus Angkutan Perkotaan Medium"));
    if (text.includes("{{LETTER_DATE}}")) setParagraphText(paragraph, text.replaceAll("{{LETTER_DATE}}", data.letterDate));
  }
}

export async function downloadBrandingLetter(transactionId: string, kind: "penawaran" | "konfirmasi") {
  const response = await fetch(`/api/branding/references/${encodeURIComponent(transactionId)}/surat?jenis=${kind}`);
  const data = await response.json() as LetterData | { error: string };
  if (!response.ok) throw new Error("error" in data ? data.error : "Data surat tidak dapat dimuat.");
  const letter = data as LetterData;
  const templateUrl = `/branding-letter-templates/${kind === "konfirmasi" ? "confirmation" : "offer"}.docx`;
  const templateResponse = await fetch(templateUrl, { cache: "no-store" });
  if (!templateResponse.ok) throw new Error("Template surat tidak ditemukan.");
  const zip = await JSZip.loadAsync(await templateResponse.arrayBuffer());
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("Isi dokumen template tidak terbaca.");
  const parser = new DOMParser();
  const xml = parser.parseFromString(await documentFile.async("string"), "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error("XML template surat tidak valid.");
  fillCommonFields(xml, letter);
  if (kind === "konfirmasi") updateConfirmationTable(xml, letter);
  else updateOfferTable(xml, letter);
  zip.file("word/document.xml", new XMLSerializer().serializeToString(xml));
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const safeReference = letter.reference?.replace(/[^a-zA-Z0-9_-]/g, "_") || transactionId;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `surat-${kind}-${safeReference}.docx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function BrandingLetterDownload({ transactionId, kind }: { transactionId: string; kind: "penawaran" | "konfirmasi" }) {
  const [loading, setLoading] = useState(false);
  const Icon = kind === "konfirmasi" ? FileText : ScrollText;
  const label = kind === "konfirmasi" ? "Konfirmasi" : "Penawaran";
  return <button className="btn ghost small" type="button" disabled={loading}
    title={`Unduh surat ${label.toLowerCase()} dari template Operator A untuk seluruh referensi`}
    onClick={async () => {
      setLoading(true);
      try { await downloadBrandingLetter(transactionId, kind); }
      catch (error) { window.alert(error instanceof Error ? error.message : "Surat gagal dibuat."); }
      finally { setLoading(false); }
    }}>
    <Icon size={13} /> {loading ? "Menyiapkan…" : label}
  </button>;
}
