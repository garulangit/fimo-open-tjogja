# 12 — File Processing & Storage

## Buckets

| Bucket | Used by | Visibility |
|---|---|---|
| `branding-docs` | Branding admin documents + bus photos | Private |
| `claim-docs` | Claim evidence PDFs | Private |

This is a deliberate break from the legacy design, which used a **public** bucket.
In OMS, files are only reachable through API routes that (1) check the caller's
permission, then (2) mint a short-lived signed URL with the service-role client:
`GET /api/branding/files`, `GET /api/claim/files`.

## Upload validation (server-side)

| Kind | Types | Max size |
|---|---|---|
| PKS (contract) | PDF | 5 MB |
| Invoice, Bukti Transfer, Kwitansi, Faktur Pajak | PDF | 2 MB |
| Bus photos | JPG/PNG | 1 MB |
| Claim evidence | PDF (checksum + page count recorded) | per claim configuration |

Metadata rows (`branding_admin_documents`, `branding_bus_photos`,
`claim_item_documents`) hold the bucket path and file facts; binaries never pass
through the database.

## PDF generation (pdf-lib, in-Worker)

All PDFs are generated server-side with `pdf-lib` — no external service:

| Document | Builder |
|---|---|
| Nota Dinas (official format) | `lib/pdf.ts` rich builder (`newNotaDoc`: justified rich text, bordered tables with colspan footers, multi-page) + composition in `lib/nota-pdf.ts` |
| Surat Penawaran / Surat Konfirmasi | `lib/pdf.ts` letter builders (`newLetter` etc.) |
| Claim letter | Template-driven builder (`lib/claim-server.ts` + `lib/pdf.ts`) |

Notes and limitations:

- Standard PDF fonts (Helvetica family) are used; the official Nota Dinas example
  uses Arial Narrow — embedding it would need `@pdf-lib/fontkit` + font files
  (not approved; see module doc).
- Amounts in words use `lib/terbilang.ts` (Indonesian, Title Case).
- Generation was spike-tested at < 1 ms for typical documents on Cloudflare Workers
  (see `SPIKE-RESULTS.md`).
- **Not built**: merging the claim letter and its evidence PDFs into one file
  (legacy parity gap).

## Photo processing

Photo Stamp processing is entirely client-side in the vendored static app
(EXIF read, canvas stamping, JSZip/PapaParse) — see
[Module: Photo Stamp](05-module-photo-stamp.md). OMS stores none of its output.

## Second backend: self-hosted MinIO (migration 0011, since 11 Nov 2026)

Document rows carry a `storage_backend` value (`supabase` | `minio`). The
storage library (`lib/storage.ts`) speaks S3 SigV4 via WebCrypto — no new
runtime dependency — against MinIO on self-hosted server, reachable publicly only
through the Cloudflare Tunnel `files.example.com`; the Worker is the
sole broker and metadata stays in Supabase. Staging runs with
`STORAGE_BACKEND=minio` (16 objects migrated with sha256 verification);
**production still uses the Supabase backend** — its cut-over is a separate,
explicit step. Automatic backups must pull self-hosted files into the same Drive
zip once production flips.
