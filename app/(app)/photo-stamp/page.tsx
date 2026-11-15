import { Camera, Expand } from "lucide-react";
import { requireContext } from "@/lib/auth";

/**
 * Photo Stamp di dalam shell OMS: aplikasi mandiri untuk stempel foto dan
 * laporan lembur disajikan dari /photo-stamp-overtime/. Aplikasi berjalan di
 * iframe agar sidebar dan navigasi OMS tetap terlihat; prosesnya client-side.
 */
export default async function PhotoStampPage() {
  await requireContext();
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 9 }}>
          <Camera size={21} /> PhotoStamp — Laporan Lembur
        </h2>
        <span className="tag">Proses lokal di browser</span>
        <span style={{ flex: 1 }} />
        <a className="btn secondary small" href="/photo-stamp-overtime/index.html" target="_blank" rel="noreferrer">
          <Expand size={14} /> Buka layar penuh
        </a>
      </div>
      <div
        className="card"
        style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}
      >
        <iframe
          src="/photo-stamp-overtime/index.html"
          title="PhotoStamp — Laporan Lembur"
          sandbox="allow-scripts allow-downloads"
          style={{
            display: "block",
            width: "100%",
            height: "calc(100dvh - 205px)",
            minHeight: 560,
            border: 0,
            background: "var(--surface)",
          }}
        />
      </div>
    </>
  );
}
