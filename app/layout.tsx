import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "FIMO — Angkutan Perkotaan",
  appleWebApp: { capable: true, title: "FIMO", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#177245",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("oms-theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="id" data-theme={theme}>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
