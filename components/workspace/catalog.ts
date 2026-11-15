export type CatalogCategory = "Operasional Transportasi" | "Pemantauan Armada" | "Layanan Korporat" | "Komunikasi";
// Data CONTOH untuk edisi terbuka — ganti dengan tautan sistem di lingkungan Anda.
export const APPLICATIONS = [
  { name: "Dashboard Ticketing", category: "Operasional Transportasi", description: "Akses dashboard ticketing dan transaksi angkutan perkotaan.", url: "https://example.com/ticketing", icon: "ticketing" },
  { name: "GPS App", category: "Operasional Transportasi", description: "Pantau lokasi dan pergerakan armada.", url: "https://example.com/gps", icon: "gps" },
  { name: "FMS", category: "Operasional Transportasi", description: "Akses sistem manajemen armada (fleet management system).", url: "https://example.com/fms", icon: "fms" },
  { name: "CCTV Bus", category: "Pemantauan Armada", description: "Pantau kondisi bus melalui CCTV.", url: "https://example.com/cctv", icon: "cctv" },
  { name: "Fuel Sensor & IoT Bus", category: "Pemantauan Armada", description: "Pantau sensor bahan bakar dan perangkat IoT bus.", url: "https://example.com/iot", icon: "fuel" },
  { name: "Webmail", category: "Layanan Korporat", description: "Akses email korporat.", url: "https://example.com/mail", icon: "mail" },
  { name: "ERP", category: "Layanan Korporat", description: "Akses portal ERP operator.", url: "https://example.com/erp", icon: "erp" },
  { name: "CRM", category: "Komunikasi", description: "Akses CRM untuk komunikasi pelanggan.", url: "https://example.com/crm", icon: "crm" },
] as const;

export const DOCUMENTS = [
  { slug: "peta-jaringan", title: "Peta Jaringan", category: "Informasi Transportasi", type: "PDF", description: "Peta jaringan angkutan perkotaan.", url: "https://example.com/peta-jaringan.pdf" },
  { slug: "template-pengalihan", title: "Template Pengalihan", category: "Template Operasional", type: "Google Drive", description: "Folder template pengalihan.", url: "https://example.com/template-pengalihan" },
  { slug: "berkas-branding", title: "Berkas Administrasi Branding", category: "Administrasi Branding", type: "Google Drive", description: "Folder berkas administrasi branding.", url: "https://example.com/berkas-branding" },
  { slug: "data-bus", title: "Data Bus", category: "Data Armada", type: "Google Sheets", description: "Spreadsheet data bus.", url: "https://example.com/data-bus" },
] as const;
