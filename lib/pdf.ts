import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const INK = rgb(0.09, 0.11, 0.09);
const MUTED = rgb(0.35, 0.4, 0.36);
const GREEN = rgb(0.09, 0.45, 0.27);

export interface PdfBuilder {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  bold: PDFFont;
  regular: PDFFont;
  line: (text: string, opts?: { size?: number; bold?: boolean; color?: typeof INK; gap?: number }) => void;
  space: (n?: number) => void;
  rule: () => void;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = trial;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function newLetter(): Promise<PdfBuilder> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([595.28, 841.89]); // A4
  const b: PdfBuilder = {
    doc,
    page,
    y: 841.89 - 56,
    bold,
    regular,
    line(text, opts = {}) {
      const size = opts.size ?? 11;
      const font = opts.bold ? bold : regular;
      for (const part of wrap(text, font, size, 595.28 - 112)) {
        if (b.y < 58) {
          page = doc.addPage([595.28, 841.89]);
          b.page = page;
          b.y = 841.89 - 56;
        }
        b.page.drawText(part, { x: 56, y: b.y, size, font, color: opts.color ?? INK });
        b.y -= size + 5;
      }
      b.y -= opts.gap ?? 2;
    },
    space(n = 8) {
      b.y -= n;
    },
    rule() {
      b.page.drawLine({
        start: { x: 56, y: b.y + 4 },
        end: { x: 595.28 - 56, y: b.y + 4 },
        thickness: 1.6,
        color: GREEN,
      });
      b.y -= 10;
    },
  };
  // Kop surat
  b.line("PT ANINDYA MITRA INTERNASIONAL", { size: 14, bold: true, gap: 0 });
  b.line("Unit Transportasi Angkutan Perkotaan — Yogyakarta", { size: 10, color: MUTED, gap: 2 });
  b.rule();
  return b;
}

export function signature(b: PdfBuilder, title: string, name = "( ____________________ )") {
  b.space(18);
  b.line("Yogyakarta, " + new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }), { size: 11 });
  b.line(title, { size: 11 });
  b.space(42);
  b.line(name, { size: 11, bold: true });
}

export async function toBytes(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save();
}

// =====================================================================
// Rich document builder — khusus Nota Dinas versi contoh resmi
// (PDF contoh owner 9 Nov 2026: A4, margin kiri 72pt, Arial Narrow 11pt
// di Word; di sini Helvetica family — metrik terdekat di StandardFonts).
// =====================================================================

export interface Seg {
  t: string;
  b?: boolean;
  i?: boolean;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 72;
const MR = 43;
const CW = PAGE_W - ML - MR; // 480.28
const TOP = 72;
const BOTTOM = 56;
const BLACK = rgb(0.08, 0.08, 0.08);

interface RWord {
  t: string;
  font: PDFFont;
  w: number;
}

export interface NotaDoc {
  doc: PDFDocument;
  newPage: () => void;
  gap: (n: number) => void;
  plain: (text: string, opts?: { size?: number; bold?: boolean; italic?: boolean; gapAfter?: number; x?: number }) => void;
  metaRow: (label: string, value: string) => void;
  rule: () => void;
  para: (
    segs: Seg[],
    opts?: {
      size?: number;
      firstIndent?: number;
      leftIndent?: number;
      hanging?: number;
      align?: "left" | "justify";
      gapAfter?: number;
    },
  ) => void;
  table: (opts: {
    cols: { w: number; align?: "l" | "c" | "r" }[];
    header: string[];
    rows: string[][];
    footers?: { label: string; value: string }[];
    size?: number;
  }) => void;
}

export async function newNotaDoc(): Promise<NotaDoc> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItal = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const fontFor = (s: Seg) => (s.b && s.i ? boldItal : s.b ? bold : s.i ? ital : reg);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - TOP; // baseline cursor (pdf coords)

  const ensure = (need: number) => {
    if (y - need < BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - TOP;
    }
  };

  function tokenize(segs: Seg[], size: number): RWord[] {
    const raw: RWord[] = [];
    for (const s of segs) {
      const font = fontFor(s);
      for (const w of s.t.split(/\s+/)) {
        if (w) raw.push({ t: w, font, w: font.widthOfTextAtSize(w, size) });
      }
    }
    // Tanda baca menempel ke kata sebelumnya ("2026," bukan "2026 ,") dan
    // kurung buka menempel ke kata sesudahnya ("(Sebelas" bukan "( Sebelas").
    const out: RWord[] = [];
    for (const w of raw) {
      const prev = out[out.length - 1];
      if (prev && /^[,.);:%]/.test(w.t)) {
        prev.t += w.t;
        prev.w += w.w;
      } else if (prev && prev.t === "(") {
        out[out.length - 1] = { t: "(" + w.t, font: w.font, w: prev.w + w.w };
      } else out.push({ ...w });
    }
    return out;
  }

  function wrapCell(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const lines: string[] = [];
    for (const ln of wrap(text, font, size, maxW)) {
      if (font.widthOfTextAtSize(ln, size) <= maxW || ln.length <= 1) {
        lines.push(ln);
        continue;
      }
      // Kata tunggal lebih lebar dari sel: pecah per karakter agar tidak
      // meluber keluar border sel.
      let cur = "";
      for (const ch of ln) {
        if (cur && font.widthOfTextAtSize(cur + ch, size) > maxW) {
          lines.push(cur);
          cur = ch;
        } else cur += ch;
      }
      if (cur) lines.push(cur);
    }
    return lines;
  }

  function wrapWords(words: RWord[], firstWidth: number, restWidth: number, spaceW: number): RWord[][] {
    const lines: RWord[][] = [];
    let cur: RWord[] = [];
    let curW = 0;
    let limit = firstWidth;
    for (const w of words) {
      const add = cur.length ? spaceW + w.w : w.w;
      if (cur.length && curW + add > limit) {
        lines.push(cur);
        cur = [w];
        curW = w.w;
        limit = restWidth;
      } else {
        cur.push(w);
        curW += add;
      }
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  const nd: NotaDoc = {
    doc,
    newPage() {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - TOP;
    },
    gap(n) {
      y -= n;
    },
    plain(text, opts = {}) {
      const size = opts.size ?? 11;
      const font = opts.bold && opts.italic ? boldItal : opts.bold ? bold : opts.italic ? ital : reg;
      ensure(size + 4);
      page.drawText(text, { x: opts.x ?? ML, y, size, font, color: BLACK });
      y -= size + 3 + (opts.gapAfter ?? 0);
    },
    metaRow(label, value) {
      const size = 11;
      ensure(size + 4);
      page.drawText(label, { x: ML, y, size, font: reg, color: BLACK });
      page.drawText(":", { x: ML + 72, y, size, font: reg, color: BLACK });
      page.drawText(value, { x: ML + 77, y, size, font: reg, color: BLACK });
      y -= size + 2.6;
    },
    rule() {
      page.drawLine({ start: { x: ML, y: y + 5 }, end: { x: ML + CW, y: y + 5 }, thickness: 0.8, color: BLACK });
      y -= 8;
    },
    para(segs, opts = {}) {
      const size = opts.size ?? 11;
      const lh = size + 3;
      const leftIndent = opts.leftIndent ?? 0;
      const hanging = opts.hanging ?? 0;
      const firstIndent = opts.firstIndent ?? 0;
      const align = opts.align ?? "justify";
      const spaceW = reg.widthOfTextAtSize(" ", size);
      const words = tokenize(segs, size);
      const firstWidth = CW - leftIndent - firstIndent;
      const restWidth = CW - leftIndent - hanging;
      const lines = wrapWords(words, firstWidth, restWidth, spaceW);
      lines.forEach((lineWords, idx) => {
        ensure(lh);
        const isFirst = idx === 0;
        const isLast = idx === lines.length - 1;
        const avail = isFirst ? firstWidth : restWidth;
        const lineW = lineWords.reduce((s, w) => s + w.w, 0) + spaceW * Math.max(0, lineWords.length - 1);
        let extra = 0;
        if (align === "justify" && !isLast && lineWords.length > 1) {
          extra = (avail - lineW) / (lineWords.length - 1);
        }
        let x = ML + leftIndent + (isFirst ? firstIndent : hanging);
        for (const w of lineWords) {
          page.drawText(w.t, { x, y, size, font: w.font, color: BLACK });
          x += w.w + spaceW + extra;
        }
        y -= lh;
      });
      y -= opts.gapAfter ?? 4;
    },
    table(opts) {
      const size = opts.size ?? 10;
      const lh = size + 2.5;
      const padX = 4;
      const padY = 3;
      const totalW = opts.cols.reduce((s, c) => s + c.w, 0);
      // Geometri bersih: `top` = tepi atas baris berjalan (koordinat pdf).
      // Baseline baris teks ke-li dalam sel = top - padY - size + 2 - li*lh.
      let top = y + size + padY;

      const startRow = (rowH: number) => {
        if (top - rowH < BOTTOM) {
          page = doc.addPage([PAGE_W, PAGE_H]);
          top = PAGE_H - TOP + size + padY;
        }
      };
      const drawRow = (cells: string[], font: PDFFont, isHeader: boolean) => {
        const wrapped = cells.map((c, i) => wrapCell(c, font, size, opts.cols[i].w - padX * 2));
        const rowH = Math.max(...wrapped.map((l) => l.length), 1) * lh + padY * 2;
        startRow(rowH);
        let cx = ML;
        cells.forEach((c, i) => {
          const col = opts.cols[i];
          page.drawRectangle({ x: cx, y: top - rowH, width: col.w, height: rowH, borderWidth: 0.7, borderColor: BLACK });
          wrapped[i].forEach((ln, li) => {
            const tw = font.widthOfTextAtSize(ln, size);
            const align = isHeader ? "c" : col.align ?? "c";
            const tx = align === "l" ? cx + padX : align === "r" ? cx + col.w - padX - tw : cx + (col.w - tw) / 2;
            page.drawText(ln, { x: tx, y: top - padY - size + 2 - li * lh, size, font, color: BLACK });
          });
          cx += col.w;
        });
        top -= rowH;
      };

      drawRow(opts.header, bold, true);
      for (const r of opts.rows) drawRow(r, reg, false);
      for (const f of opts.footers ?? []) {
        const labelW = totalW - opts.cols[opts.cols.length - 1].w;
        const valW = opts.cols[opts.cols.length - 1].w;
        const rowH = lh + padY * 2;
        startRow(rowH);
        page.drawRectangle({ x: ML, y: top - rowH, width: labelW, height: rowH, borderWidth: 0.7, borderColor: BLACK });
        page.drawRectangle({ x: ML + labelW, y: top - rowH, width: valW, height: rowH, borderWidth: 0.7, borderColor: BLACK });
        const base = top - padY - size + 2;
        const lw = bold.widthOfTextAtSize(f.label, size);
        page.drawText(f.label, { x: ML + (labelW - lw) / 2, y: base, size, font: bold, color: BLACK });
        const vw = reg.widthOfTextAtSize(f.value, size);
        page.drawText(f.value, { x: ML + labelW + (valW - vw) / 2, y: base, size, font: reg, color: BLACK });
        top -= rowH;
      }
      y = top - size - 4; // kursor baseline di bawah tabel + jeda kecil
    },
  };
  return nd;
}
