// Terbilang Bahasa Indonesia — untuk teks nominal pada dokumen resmi (Nota Dinas, surat).
const SATUAN = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

function spell(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return spell(n - 10) + " Belas";
  if (n < 100) return spell(Math.floor(n / 10)) + " Puluh" + (n % 10 ? " " + spell(n % 10) : "");
  if (n < 200) return "Seratus" + (n % 100 ? " " + spell(n % 100) : "");
  if (n < 1000) return spell(Math.floor(n / 100)) + " Ratus" + (n % 100 ? " " + spell(n % 100) : "");
  if (n < 2000) return "Seribu" + (n % 1000 ? " " + spell(n % 1000) : "");
  if (n < 1_000_000) return spell(Math.floor(n / 1000)) + " Ribu" + (n % 1000 ? " " + spell(n % 1000) : "");
  if (n < 1_000_000_000) return spell(Math.floor(n / 1_000_000)) + " Juta" + (n % 1_000_000 ? " " + spell(n % 1_000_000) : "");
  if (n < 1_000_000_000_000)
    return spell(Math.floor(n / 1_000_000_000)) + " Miliar" + (n % 1_000_000_000 ? " " + spell(n % 1_000_000_000) : "");
  return spell(Math.floor(n / 1_000_000_000_000)) + " Triliun" + (n % 1_000_000_000_000 ? " " + spell(n % 1_000_000_000_000) : "");
}

/** 11500000 -> "Sebelas Juta Lima Ratus Ribu" (Title Case per kata, gaya dokumen contoh). */
export function terbilang(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const v = Math.round(Math.abs(n));
  if (v === 0) return "Nol";
  return spell(v);
}
