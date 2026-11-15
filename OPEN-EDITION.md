# Ruang Lingkup Edisi Terbuka

Repositori ini adalah **snapshot referensi** dari aplikasi FIMO
(Fleet Integrated Management & Operations) — sistem administrasi operasional
angkutan umum yang dikembangkan untuk program Angkutan Perkotaan, Daerah Istimewa
Yogyakarta, berdasarkan kerangka **Peraturan Gubernur DIY No. 110 Tahun 2024**
(sistem angkutan perkotaan; skema kontrak gross-cost dan subsidi/PSO).

## Yang termasuk

- Kode aplikasi web lengkap (Next.js + React + TypeScript): modul Branding
  (penjualan ruang iklan bus), Klaim Subsidi (penghitungan dan verifikasi
  klaim operator), Denda SPM (rekonsiliasi temuan pelanggaran standar
  pelayanan minimal dan penetapan denda), Photo Stamp, dan FIMO Agent.
- Dokumentasi konsep dan aturan bisnis di `docs/` — termasuk model data
  konseptual, alur kerja, dan rancangan otorisasi (RBAC + RLS).
- Kerangka pengujian (suite SQL dan E2E di `scripts/`).

## Yang TIDAK termasuk (tetap tertutup)

- **Database produksi dan seluruh datanya.** Tidak ada data operasional,
  data klaim, maupun kredensial apa pun dalam repositori ini. Nilai-nilai
  konfigurasi dalam `wrangler.toml` adalah placeholder.
- **Skema database (migration SQL).** Pemangku kepentingan yang ingin
  membangun sistem serupa dapat merancang skema dari dokumentasi model
  data di `docs/07-database-schema.md` dan menyesuaikannya dengan
  kebutuhan daerah masing-masing.
- **Backend dan infrastruktur penulis** (server penyimpanan berkas,
  jembatan AI agent, skrip deployment internal).

## Cara mempelajari / menjalankan

Aplikasi ini dirancang di atas Supabase (PostgreSQL + Auth) dan
Cloudflare Workers. Untuk menjalankannya diperlukan proyek Supabase
sendiri dan skema yang dibuat mengikuti dokumentasi — repositori ini
ditujukan sebagai referensi arsitektur dan logika bisnis, bukan paket
siap pasang.

## Status

Snapshot diambil dari versi staging per November 2026 (berbasis rilis
stabil v1.2.3). Repositori ini tidak diperbarui secara berkala dan tidak
dipakai untuk operasional apa pun.
