import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FIMO — Fleet Integrated Management & Operations",
    short_name: "FIMO",
    description: "Fleet Integrated Management & Operations — Angkutan Perkotaan",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f4",
    theme_color: "#177245",
    lang: "id",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
