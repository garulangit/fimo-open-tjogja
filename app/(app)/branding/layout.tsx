import { Bus } from "lucide-react";
import { requireContext } from "@/lib/auth";

export default async function BrandingLayout({ children }: { children: React.ReactNode }) {
  await requireContext("branding.dashboard.view");
  return (
    <>
      <h1 className="section-title">
        <Bus size={24} /> Branding
      </h1>
      <p className="subtitle" style={{ marginBottom: 0 }}>
        Penjadwalan branding bus, pricelist, dan kelengkapan administrasi.
      </p>
      {children}
    </>
  );
}
