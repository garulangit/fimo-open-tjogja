# 04 — Module: Klaim Subsidi / Claim (`claim`)

**Status: PARTIAL** — core workflow IMPLEMENTED (SQL tests 15/15; E2E 22/22); one
parity gap remains (see Known limitations).

## Purpose

Manages operational subsidy claims (*Klaim Subsidi*) for FIMO operators under
Kepgub DIY No. 524/KEP/2024: assembling cost components, attaching evidence documents,
verifying submissions, and computing the payable subsidy. It is the port of the legacy
`subsiditrack` application, with its security gaps closed (the legacy app had
unauthenticated APIs, cross-claim IDOR, and unvalidated status changes).

## Features

- **Master data** (`/claim/master`, Setting → Master Data Klaim): vehicle types,
  regulation versions, cost-category tree (127 categories), document types and
  per-category requirements (735), letter templates.
- **Claim assembly** (`/claim/list`, detail `/claim/[id]`): operator, PIC, period
  (month/year); cost items generated from input categories; per-item tax modes
  (`PPN_11` 11%, `CUSTOM`, `NONE`, HALF_UP rounding to 2 decimals); revenues (ticket,
  branding) that reduce the subsidy.
- **Calculation** (`lib/claim.ts`, ported exactly and verified against legacy totals):
  `base = direct + indirect`; `profit = 7% of base` (default); `operational = base +
  profit + supporting`; `subsidy = operational − ticket − branding`. Category totals
  roll up as `DIRECT`/`INDIRECT`/`SUPPORTING` (`SUBTOTAL` rows are not summed).
- **Claim numbers**: `CLM-{vehicle-code letter}-{year}-{sequence:0000}`.
- **Two-level validation** (owner decision, 1.0.1): *blocking* errors are limited to
  identity/period/negative amounts/no cost items. Missing evidence documents are a
  **warning**, recorded in the audit trail as `dokumen_kurang`, and never block saving
  or submission.
- **Workflow**: `DRAFT → SUBMITTED → IN_REVIEW → (REVISION_REQUIRED | APPROVED |
  REJECTED) → COMPLETED`, enforced by the `claim_guard_transition` trigger. Each
  submission freezes a version snapshot (`claim_versions`).
- **Evidence documents**: per-item PDFs in the private `claim-docs` bucket (checksum
  + page count recorded), downloaded via signed URLs.
- **Claim letter PDF** (`GET /api/claim/claims/[id]/pdf`): generated from the stored
  letter template (Dishub DIY letterhead).
- **Summary CSV**: after creating/submitting a claim, a UTF-8 (BOM, CRLF) summary CSV
  downloads automatically (`GET /api/claim/claims/[id]/summary`), formula-injection
  safe; re-downloading never duplicates the claim.
- **Verification queue** (`/claim/verify`) and **reports** (`/claim/reports`).
- **Overview dashboard** (`/claim`): totals, verification queue, approved vs requested
  subsidy for the current year (shown separately, never summed together), 12-month
  trend by period, status donut, latest verification activity from the audit trail.

## User workflow

1. Staff create a claim for an operator and period; items are generated from the
   master categories and filled in.
2. Evidence PDFs are attached per item (missing evidence warns but does not block).
3. Submit → claim enters the verification queue (`SUBMITTED`, then `IN_REVIEW`).
4. Verifier reviews; requests revision, rejects, or approves. Approved claims can be
   completed. Every transition and the document-completeness note are audited.

## Data

11 tables: `claims`, `claim_items`, `claim_item_documents`, `claim_revenues`,
`claim_versions`, `claim_cost_categories`, `claim_document_requirements`,
`claim_document_types`, `claim_vehicle_types`, `claim_regulation_versions`,
`claim_letter_templates`. Money is `numeric(20,2)` everywhere (legacy used floats).
See [Database Schema](07-database-schema.md).

## API & dependencies

Routes under `/api/claim/*` — see [API Reference](09-api-reference.md). Depends on the
platform foundation, Supabase Storage (private bucket), pdf-lib.

## Authorization

Permissions: `claim.dashboard.view`, `claim.claim.view|create|edit|submit|verify|
approve|delete`, `claim.master.view|manage`, `claim.reports.view`. Submit, verify,
and approve are separate permissions so duties can be split by role assignment.

## Known limitations

- **Combined claim PDF not built (PARTIAL).** The legacy app produced one PDF merging
  the claim letter with all evidence attachments. OMS currently generates the letter
  only; evidence files are downloaded individually. This is the oldest open parity
  item and the main remaining pre-go-live work for this module.
- Claim reports cover period recaps; legacy export formats beyond the summary CSV
  have not been ported.
