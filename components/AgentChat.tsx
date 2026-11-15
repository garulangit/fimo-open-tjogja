"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Download, Paperclip, Send, X } from "lucide-react";

interface Msg {
  role: "user" | "agent";
  text: string;
  rows?: Record<string, string | null>[] | null;
}

const EXAMPLES = [
  "Berapa total nilai kontrak branding yang tercatat?",
  "Rekap booking branding per operator",
  "Ada berapa klaim subsidi yang tercatat?",
];

function rowsToCsv(rows: Record<string, string | null>[]): string {
  const headers = Object.keys(rows[0] ?? {});
  const esc = (v: string | null) => {
    const s = v ?? "";
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export default function AgentChat({ displayName }: { displayName: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attachText, setAttachText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function onAttach(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) {
      setError("Berkas terlalu besar (maks 200 KB untuk dilampirkan sebagai teks).");
      return;
    }
    const text = await file.text();
    setAttachText(text.slice(0, 6000));
    setAttachName(file.name);
    setError("");
  }

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setError("");
    setInput("");
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/agent/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          history,
          attachment_text: attachText || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Agent gagal menjawab.");
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: data.answer ?? "", rows: data.rows ?? null },
      ]);
      setAttachName("");
      setAttachText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent gagal menjawab.");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv(rows: Record<string, string | null>[]) {
    const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hasil-agent.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const firstName = displayName.split(" ")[0] || "Bos";

  return (
    <div className="agent-wrap">
      <div className="agent-note">
        Percakapan dengan Agent tercatat untuk keperluan audit perusahaan.
      </div>

      <div className="agent-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="agent-empty">
            <div className="agent-avatar"><Bot size={26} /></div>
            <h3>Halo, {firstName}. Saya FIMO Agent.</h3>
            <p>
              Tanyakan data operasional sesuai akses Anda — rekap booking,
              nilai kontrak, ringkasan klaim — atau minta bantuan menyusun
              rekap. Jawaban selalu disertai angka dan sumber datanya.
            </p>
            <div className="agent-examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="agent-chip" onClick={() => send(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`agent-msg ${m.role}`}>
            {m.role === "agent" && <div className="agent-avatar sm"><Bot size={16} /></div>}
            <div className="agent-bubble">
              <div className="agent-text">{m.text}</div>
              {m.rows && m.rows.length > 0 && (
                <div className="agent-filecard">
                  <div>
                    <strong>Hasil data</strong>
                    <span>{m.rows.length} baris</span>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => downloadCsv(m.rows!)}>
                    <Download size={14} /> Unduh CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="agent-msg agent">
            <div className="agent-avatar sm"><Bot size={16} /></div>
            <div className="agent-bubble agent-thinking">Agent sedang menelusuri data…</div>
          </div>
        )}
      </div>

      {error && <div className="agent-error">{error}</div>}

      <div className="agent-inputbar">
        {attachName && (
          <div className="agent-attach-chip">
            <Paperclip size={13} /> {attachName}
            <button type="button" aria-label="Lepas lampiran" onClick={() => { setAttachName(""); setAttachText(""); }}>
              <X size={13} />
            </button>
          </div>
        )}
        <div className="agent-inputrow">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv,.md"
            hidden
            onChange={(e) => onAttach(e.target.files?.[0])}
          />
          <button
            type="button"
            className="agent-iconbtn"
            aria-label="Lampirkan berkas teks/CSV"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={18} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Tulis pertanyaan…"
            disabled={busy}
          />
          <button
            type="button"
            className="agent-sendbtn"
            aria-label="Kirim pertanyaan"
            onClick={() => send()}
            disabled={busy || !input.trim()}
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
