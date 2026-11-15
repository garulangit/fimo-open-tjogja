const ERRORS: Record<string, string> = {
  lama: "Password lama salah.",
  pendek: "Password baru minimal 6 karakter.",
  beda: "Konfirmasi password baru tidak cocok.",
  sama: "Password baru harus berbeda dari password lama.",
};

import { Bus, KeyRound, Lock, ShieldCheck } from "lucide-react";
import AppFooter from "@/components/AppFooter";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; forced?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <div className="orbs" />
      <div className="auth-wrap">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%", maxWidth: 408 }}>
      <div className="card auth-card anim-pop">
        <div className="brand">
          <div className="brand-tile">
            <Bus size={30} />
          </div>
          <div>
            <div className="tj">TRANS JOGJA</div>
            <div className="oms">
              FIMO<span className="grad-text">.</span>
            </div>
          </div>
        </div>
        <p className="auth-sub">
          Ganti password Anda. Untuk akun baru atau setelah reset, langkah ini wajib sebelum
          masuk ke aplikasi.
        </p>
        {error && <div className="alert error">{ERRORS[error] ?? "Gagal mengganti password."}</div>}
        <form method="post" action="/api/account/password">
          <div className="field">
            <label htmlFor="current_password">Password lama</label>
            <input
              id="current_password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new_password">Password baru</label>
            <input
              id="new_password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm_password">Konfirmasi password baru</label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          <button className="btn primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            <ShieldCheck size={16} /> Simpan password baru
          </button>
        </form>
      </div>
      <AppFooter />
      </div>
      </div>
    </>
  );
}
