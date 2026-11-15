import { requireContext } from "@/lib/auth";
import AgentChat from "@/components/AgentChat";

// Modul Agent (v1.2.0): chat tanya-jawab atas data operasional, read-only.
// Guard izin agent.use (matriks modul); scope data ditegakkan di database
// oleh Bridge — halaman ini tidak menampilkan keterangan scope apa pun.
export default async function AgentPage() {
  const ctx = await requireContext("agent.use");
  return (
    <>
      <div className="card anim-pop" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>Agent</h3>
        <p className="muted" style={{ margin: 0 }}>
          Asisten data internal FIMO — tanya-jawab, rekap, dan bantuan susun
          laporan atas data operasional.
        </p>
      </div>
      <AgentChat displayName={ctx.displayName} />
    </>
  );
}
