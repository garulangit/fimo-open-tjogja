import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus } from "@/lib/branding";
import BrandingTransactionTable, { type BrandingTransactionRow } from "@/components/dashboard/BrandingTransactionTable";
import { applyAdjustments, loadActiveAdjustments } from "@/lib/branding-adjust";

export default async function BrandingHistoryPage() {
  const ctx = await getSessionContext();
  if (ctx && !ctx.featureAccess["branding.history"]) {
    return (
      <>
        <h1 className="section-title">History Branding</h1>
        <p className="subtitle">Akses submenu History dibatasi untuk akun Anda.</p>
      </>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("branding_bookings")
    .select("*, branding_buses(id, no_polisi, fleet_no, hull_no, route, bus_type)")
    .order("end_date", { ascending: false });
  const adjMap = await loadActiveAdjustments(supabase);
  const rows = applyAdjustments(((data ?? []) as unknown as BrandingTransactionRow[])
    .filter((row) => effectiveStatus(row.status, row.end_date) === "SELESAI"), adjMap);

  return <>
    <h2>History Branding</h2>
    <p className="muted small-text">Transaksi dengan periode yang telah berakhir. Status dihitung berdasarkan tanggal Asia/Jakarta; data sumber tetap tersimpan sebagai booking.</p>
    <BrandingTransactionTable rows={rows} buses={[]} canManage={ctx?.permissions.includes("branding.booking.manage") ?? false} history adjustments={Object.fromEntries(adjMap)} />
  </>;
}
