"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRupiah } from "@/lib/branding";
import type { TotalAdjustment } from "@/lib/branding-adjust";

interface HistoryItem {
  id: string;
  computed_total: number;
  adjusted_total: number;
  ratio: number;
  reason: string;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
}

const pct = (ratio: number) => {
  const v = (ratio - 1) * 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
};

/**
 * Popup override total (nego). Dua langkah sesuai alur kerja: isi total
 * kesepakatan + alasan, lalu popup konfirmasi ringkasan sebelum menyimpan.
 * Rasio dihitung ulang di server dari snapshot terkini (kunci rasio).
 */
export default function OverrideTotalModal({
  groupKey,
  label,
  originalTotal,
  active,
  onClose,
}: {
  groupKey: string;
  label: string;
  originalTotal: number;
  active: TotalAdjustment | null;
  onClose: () => void;
}) {
  const currentEffective = active ? Math.round(originalTotal * active.ratio) : originalTotal;
  const [step, setStep] = useState<"edit" | "confirm" | "confirm-remove">("edit");
  const [total, setTotal] = useState<string>(String(currentEffective));
  const [reason, setReason] = useState<string>(active?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    fetch(`/api/branding/adjustments?key=${encodeURIComponent(groupKey)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setHistory(j.items ?? []))
      .catch(() => setHistory([]));
  }, [groupKey]);

  const parsed = useMemo(() => {
    const n = Number(total.replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, [total]);
  const ratio = originalTotal > 0 ? parsed / originalTotal : 0;
  const diff = parsed - originalTotal;
  const valid = parsed > 0 && reason.trim().length > 0 && Math.abs(ratio - (active?.ratio ?? 1)) > 0.0000001;

  async function submit(remove = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/branding/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          remove
            ? { transaction_key: groupKey, action: "remove" }
            : { transaction_key: groupKey, adjusted_total: parsed, reason: reason.trim() },
        ),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Gagal menyimpan.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
      setBusy(false);
    }
  }

  return (
    <div className="ov-overlay" role="dialog" aria-modal="true" aria-label="Override total transaksi">
      <div className="ov-panel">
        <div className="ov-head">
          <div>
            <h3 style={{ margin: 0 }}>Override Total (Nego)</h3>
            <div className="muted small-text">{label}</div>
          </div>
          <button type="button" className="btn ghost small" onClick={onClose} disabled={busy}>Tutup</button>
        </div>

        {step === "edit" && (
          <>
            <div className="ov-summary">
              <div><span>Total pricelist (PPN)</span><strong>{formatRupiah(originalTotal)}</strong></div>
              {active && (
                <div><span>Sedang berlaku (nego {pct(active.ratio)})</span><strong>{formatRupiah(currentEffective)}</strong></div>
              )}
            </div>
            <label htmlFor="ov-total">Total kesepakatan nego (termasuk PPN)</label>
            <input
              id="ov-total"
              inputMode="numeric"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="cth. 2500000000"
            />
            <div className="muted small-text" style={{ marginTop: 6 }}>
              {parsed > 0
                ? <>Rasio kesepakatan: <strong>{ratio.toFixed(4).replace(".", ",")}x</strong> ({pct(ratio)}) · Selisih {formatRupiah(diff)} dari pricelist. Rasio ini yang dikunci — total efektif mengikuti perubahan data dengan persentase yang sama.</>
                : "Isi total hasil nego. Snapshot & pricelist tidak diubah."}
            </div>
            <label htmlFor="ov-reason" style={{ marginTop: 12 }}>Alasan (wajib, masuk catatan audit)</label>
            <textarea id="ov-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="cth. Nego ulang kontrak 2027 — disepakati pada rapat 11 Nov" />
            {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
            <div className="ov-actions">
              {active && (
                <button type="button" className="btn ghost small" onClick={() => setStep("confirm-remove")} disabled={busy}>
                  Cabut penyesuaian
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Batal</button>
              <button type="button" className="btn" onClick={() => setStep("confirm")} disabled={!valid || busy}>
                Tinjau &amp; Simpan
              </button>
            </div>
            {history.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="small-text" style={{ fontWeight: 600, marginBottom: 6 }}>Riwayat penyesuaian grup ini</div>
                {history.map((h) => (
                  <div key={h.id} className="ov-history">
                    <span>{new Date(h.created_at).toLocaleDateString("id-ID")} · {h.created_by_name ?? "—"}</span>
                    <span>{formatRupiah(Number(h.computed_total))} → {formatRupiah(Number(h.adjusted_total))} ({pct(Number(h.ratio))})</span>
                    <span className="muted">{h.reason}{h.is_active ? " · AKTIF" : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === "confirm" && (
          <>
            <p className="small-text">
              Total ini dipakai di <strong>tabel Branding, laporan, resume dashboard, dan surat</strong>.
              Pricelist dan snapshot asli tidak berubah; penyesuaian tercatat di audit dengan alasanmu.
            </p>
            <div className="ov-summary">
              <div><span>Total pricelist</span><strong>{formatRupiah(originalTotal)}</strong></div>
              <div><span>Total kesepakatan</span><strong>{formatRupiah(parsed)}</strong></div>
              <div><span>Selisih / rasio</span><strong>{formatRupiah(diff)} · {ratio.toFixed(4).replace(".", ",")}x ({pct(ratio)})</strong></div>
              <div><span>Alasan</span><strong style={{ textAlign: "right" }}>{reason.trim()}</strong></div>
            </div>
            {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
            <div className="ov-actions">
              <button type="button" className="btn ghost" onClick={() => setStep("edit")} disabled={busy}>Kembali</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn" onClick={() => submit(false)} disabled={busy}>
                {busy ? "Menyimpan…" : "Ya, Simpan Penyesuaian"}
              </button>
            </div>
          </>
        )}

        {step === "confirm-remove" && (
          <>
            <p className="small-text">
              Cabut penyesuaian aktif? Total grup ini kembali ke nilai pricelist/snapshot.
              Riwayat penyesuaian tetap tersimpan di catatan audit.
            </p>
            {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
            <div className="ov-actions">
              <button type="button" className="btn ghost" onClick={() => setStep("edit")} disabled={busy}>Kembali</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn" onClick={() => submit(true)} disabled={busy}>
                {busy ? "Memproses…" : "Ya, Cabut"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
