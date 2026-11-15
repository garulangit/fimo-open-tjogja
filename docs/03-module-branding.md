# 03 — Module: Branding FIMO (`branding`)

**Status: IMPLEMENTED** (staging; SQL tests 16/16, exclusivity 5/5, reference checks in
suite 0005; E2E 27/27)

## Purpose

Manages advertising space ("branding") on FIMO buses: the bus master data, client
bookings per placement and period, versioned pricelists with VAT, administrative
documents (PKS contracts, invoices, receipts), bus photos, official letters (Surat
Penawaran, Surat Konfirmasi), and the **Nota Dinas** — the internal memo used to request
contract drafting by Legal.

## Features

- **Bus master data** (`/branding/buses`): police number (unique), fleet number, hull
  number, bus type, route (legacy `jalurBus`, e.g. `5B`, `1A`, `CAD B`), colour,
  body maker. Sortable, numbered table.
- **Bookings** (`/branding/bookings`): create/edit/status/delete. One submission can
  cover **multiple buses** (searchable multi-select picker); all buses in a submission
  share one **Reference Number** (`REF-YYYYMM-XXXXXXXX`, migration 0005).
- **Pricing engine** (server-side, `lib/branding-server.ts`): duration rules and tiers
  ported from legacy — see [Business Workflows](10-business-workflows.md). The price is
  frozen into `pricing_snapshot` at creation and never recomputed.
- **Pricelist & VAT** (`/branding/pricing`): versioned pricelist (Angkutan Perkotaan – Medium:
  Left/Right/Full Back and Full Body at 1/3/6/12-month tiers), PPN 11% toggle/rate.
  Publishing a new version does not affect existing bookings.
- **Documents** (`/branding/documents`): per-client administrative records linked by
  Reference Number (`Reference — Company — Period`): PKS (≤ 5 MB), Invoice, Bukti
  Transfer, Kwitansi, Faktur Pajak (≤ 2 MB each), bus photos (JPG/PNG ≤ 1 MB) —
  all in the **private** `branding-docs` bucket, served via signed URLs.
- **Nota Dinas**: numbered automatically (`MM.DD.NNN/OPR/U.1/NDN/YYYY`), statuses
  `DRAFT → EDITED → FINAL`; a FINAL nota is immutable (database trigger). The PDF
  reproduces the official example format (rich-text builder in `lib/pdf.ts`,
  composition in `lib/nota-pdf.ts`): grouped detail table per Reference Number,
  totals from snapshots, payment terms with amount-in-words (`lib/terbilang.ts`),
  signature block, and an attachment (terms + route list from `lib/nota-trayek.ts`).
- **Letters**: Surat Penawaran and Surat Konfirmasi PDFs per booking
  (`GET /api/branding/bookings/[id]/surat`).
- **Overview dashboard** (`/branding`): KPIs (fleet, active bookings, occupancy,
  monthly revenue), revenue trend, status donut, fleet availability, upcoming
  bookings, placement mix, contract-expiry warnings.
- **Reports** (`/branding/reports`): monthly revenue allocation and per-brand recap
  with Reference Numbers.

## User workflow

1. (Optional) publish/verify the pricelist under *Setting → Pricelist & Tarif*.
2. Create a booking: pick brand/company, period, placement; select one or more buses.
   The server checks conflicts for **all** selected buses first — if any bus conflicts,
   the whole submission is rejected (nothing is half-saved).
3. Upload administrative documents against the booking's Reference Number.
4. Create a Nota Dinas from the document screen; finalize it when Legal is ready to
   process. Download the PDF.
5. Track the fleet from the Overview; contracts approaching their end date surface in
   the warnings card.

## Data

Tables: `branding_buses`, `branding_bookings`, `branding_pricing_config`,
`branding_reference_options`, `branding_admin_records`, `branding_admin_documents`,
`branding_bus_photos`, `branding_nota_dinas`. See [Database Schema](07-database-schema.md).

Key rules enforced in the database:

- **One active booking per bus per period** (migration 0004): any overlap with an
  active booking (`BOOKING`/`PROSES`/effective `BERJALAN`) is rejected regardless of
  placement. The legacy side/back "zone" coexistence rule was retired by owner decision.
- Effective status: a booking whose end date has passed counts as `SELESAI`
  (`branding_effective_status()`), without rewriting the stored status.
- FINAL Nota Dinas cannot be updated or deleted (`branding_nota_final_guard`).

## API & dependencies

Routes under `/api/branding/*` — see [API Reference](09-api-reference.md). Depends on
the platform foundation (auth/RLS/audit), Supabase Storage (private bucket), and
pdf-lib for all documents.

## Authorization

Permissions: `branding.dashboard.view`, `branding.booking.view|manage|delete`,
`branding.bus.view|manage`, `branding.pricing.view|manage`, `branding.documents.view|manage`,
`branding.reports.view`. Both roles hold the operational permissions; pricing
management is included for `admin` as seeded (28 superadmin / 22 admin split overall).

## Known limitations

- **Single-side placements are not modelled.** Bookings support `FULL_BODY`,
  `SIDE_BODY` (Left + Right together), and `BACK_BODY`. The official Nota Dinas
  example uses a single "Left Body" placement; adding `LEFT_BODY`/`RIGHT_BODY`
  (the legacy price tiers exist) needs an owner decision.
- **Route detail text** for the Nota Dinas attachment exists for route **5B** only;
  other routes fall back to the trayek master name (routes are never invented).
- The Nota Dinas PDF uses Helvetica (pdf-lib standard font); embedding the example's
  Arial Narrow would require a font dependency that has not been approved.
