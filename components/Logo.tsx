/**
 * Logo FIMO (edisi terbuka) — memakai aset ikon resmi FIMO di public/.
 * LogoFull: ikon + wordmark teks. LogoIcon: ikon saja.
 */
export function LogoFull({ className }: { className?: string }) {
  return (
    <span
      className={className}
      role="img"
      aria-label="FIMO"
      style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-icon.png"
        alt=""
        style={{ width: 34, height: 34, borderRadius: 8, display: "block" }}
      />
      <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: 1.5 }}>FIMO</span>
    </span>
  );
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-icon.png"
      alt="FIMO"
      className={className}
      style={{ display: "block", width: "100%", height: "auto", borderRadius: "22%" }}
    />
  );
}
