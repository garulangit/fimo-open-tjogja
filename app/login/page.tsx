import { Eye, EyeOff, Lock, LogIn, User } from "lucide-react";
import LoginMascots from "@/components/LoginMascots";
import AppFooter from "@/components/AppFooter";
import { LogoFull } from "@/components/Logo";

const ERRORS: Record<string, string> = {
  kredensial: "Username atau password salah.",
  nonaktif: "Akun ini nonaktif. Hubungi superadmin.",
  sesi: "Sesi berakhir. Silakan masuk lagi.",
  terkunci: "Terlalu banyak percobaan masuk yang gagal. Tunggu 15 menit, lalu coba lagi.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <div className="orbs" />
      <div className="auth-wrap">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%", maxWidth: 408 }}>
        <div className="card auth-card anim-pop">
          <LoginMascots initialState={error ? "failure" : undefined} />
          <div className="brand" style={{ alignItems: "center", gap: 8 }}>
            <div style={{ width: 168 }}>
              <LogoFull />
            </div>
            <div className="tj">FLEET INTEGRATED MANAGEMENT & OPERATIONS</div>
            <h1 className="auth-title">FIMO</h1>
          </div>
          <p className="auth-sub">Masuk dengan akun Anda.</p>
          {error && <div className="alert error">{ERRORS[error] ?? "Gagal masuk."}</div>}
          <form method="post" action="/api/auth/login">
            <div className="field">
              <label htmlFor="username">Username</label>
              <div className="input-icon">
                <User size={16} />
                <input id="username" name="username" autoComplete="username" required autoFocus />
              </div>
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-icon">
                <Lock size={16} />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  id="togglePassword"
                  className="pw-toggle"
                  aria-pressed="false"
                  aria-label="Tampilkan kata sandi"
                >
                  <Eye size={17} className="icon-on" />
                  <EyeOff size={17} className="icon-off" />
                </button>
              </div>
            </div>
            <button
              className="btn primary"
              type="submit"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <LogIn size={16} /> Masuk
            </button>
          </form>
          <p className="auth-foot">Lupa password? Hubungi Admin.</p>
        </div>
        <AppFooter />
        </div>
      </div>
    </>
  );
}
