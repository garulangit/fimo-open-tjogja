"use client";

import { useEffect, useRef } from "react";

/**
 * Pemicu unduhan CSV ringkasan pengajuan (revisi 1.0.1 D.4).
 * Dirender halaman detail klaim hanya bila URL membawa ?summary=1 —
 * penanda itu dipasang redirect server SETELAH pengajuan tersimpan /
 * terkirim dan terkonfirmasi berhasil. Unduhan berjalan sekali, lalu
 * penanda dibuang dari URL agar refresh tidak mengunduh ulang.
 */
export default function ClaimSummaryDownload({
  claimId,
  claimNumber,
}: {
  claimId: string;
  claimNumber: string;
}) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/claim/claims/${claimId}/summary`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `ringkasan-${claimNumber}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }
      } catch { /* unduhan gagal: abaikan, data pengajuan tidak terpengaruh */ }
      const u = new URL(window.location.href);
      u.searchParams.delete("summary");
      window.history.replaceState(null, "", u.toString());
    })();
  }, [claimId, claimNumber]);

  return null;
}
