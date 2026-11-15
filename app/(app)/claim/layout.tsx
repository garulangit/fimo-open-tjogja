import type { ReactNode } from "react";
import { requireContext } from "@/lib/auth";

export default async function ClaimLayout({ children }: { children: ReactNode }) {
  await requireContext("claim.dashboard.view");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            Klaim <span className="grad-text">Subsidi</span>
          </h1>
          <p className="sub">Pengajuan subsidi operasional Angkutan Perkotaan — komponen biaya, bukti, verifikasi, persetujuan.</p>
        </div>
      </div>
      {children}
    </>
  );
}
