# 06 — Module: Denda SPM (`spm`)

**Status: OPERATIONAL (backend live since 11 Nov 2026, migration 0010)** — the four
screens are backed by real tables, RLS, and `/api/spm/*`: violation-rate master,
two-sided CSV import (Dishub vs operator), reconciliation, and penalty
determinations with frozen amount snapshots. The SIMULASI labels were removed.
Still blocked on owner inputs: verification of the 53 seeded tariffs against the
official tariff document, a real sample Dishub CSV export, and the exact
definition of a failed service order ("gagal SO"). The per-operator Berita
Acara PDF is not built yet.

## Purpose (planned)

Track penalties (*denda*) related to the Standar Pelayanan Minimal (SPM — Minimum
Service Standards) for FIMO operations: recording SPM violations/findings,
their penalty values, and settlement status, as an administration module alongside
Branding and Claim.

## Current implementation

- Four routes: `/spm` (Overview), `/spm/reconciliation` (Rekonsiliasi),
  `/spm/penalties` (Denda), and `/spm/rates` (Besaran Denda).
- `components/NavLinks.tsx` places the expandable Denda SPM group after PhotoStamp;
  Overview, Rekonsiliasi, Denda, and Besaran Denda are sidebar submenus. The group is
  visible to `superadmin`; pages use `requireContext()` and the same role boundary.
  There is no SPM-specific permission and no schema-level operational data.
- `components/spm/violation-master.json` is a verbatim structured copy of the supplied
  `database_denda_pelanggaran_trans_jogja.csv`. It contains 48 `OPERASIONAL` and five
  `KETIDAKTERCAPAIAN_PENUMPANG` records. The CSV fields, including page reference,
  value, basis, sanctions, notes, and source status, are retained.
- CSV data have **not** been verified against `denda.pdf`. The UI marks all rates as
  unverified; no values or charging bases are inferred or edited. The 4,001–5,000
  passenger shortfall band is absent from the source and remains unpriced.
- `components/spm/spm-data.ts` centralizes the rate import, synthetic findings, and
  fleet mappings (`A` + three digits → Operator A; `J` + three digits → Operator B). Other
  fleets stay unclassified. Operator C has no invented fleet prefix.
- Overview estimates aggregate CSV rate × one synthetic unit per finding. Since the
  actual charging basis can be per bus, location, day, tire, item, or violation, these
  amounts are illustrations only and must not be used as payable calculations.
- Rekonsiliasi offers a downloadable synthetic CSV example for each selected source,
  reads chosen CSV locally in the browser, previews rows, offers per-header mapping,
  reports shape errors and exact duplicate rows, keeps an in-session file list, and
  lets the user change synthetic statuses. Example rows are marked DEMO-ONLY. No file
  is persisted and imported rows do not become findings.
- Denda preview uses only synthetic rows marked `Verified`, attaches the current CSV
  rate as a displayed snapshot, and prevents duplicate preview generation by finding
  ID in the current page session. No records or snapshots are saved.

## Source files

| File | Responsibility |
|---|---|
| `app/(app)/spm/page.tsx` | Overview route and server-side role guard |
| `app/(app)/spm/reconciliation/page.tsx` | Reconciliation route and guard |
| `app/(app)/spm/penalties/page.tsx` | Penalty preview route and guard |
| `app/(app)/spm/rates/page.tsx` | Read-only master route and guard |
| `components/spm/SpmPrototype.tsx` | Filterable synthetic dashboard and charts |
| `components/spm/WorkflowPrototype.tsx` | Local CSV preview, reconciliation status, penalty preview |
| `components/spm/RatesTable.tsx` | Searchable/filterable source catalogue |
| `components/spm/spm-data.ts` | Source typing, fleet classifier, synthetic records |
| `components/spm/violation-master.json` | CSV-derived source data |

All panels are explicitly labelled SIMULASI or belum diverifikasi. CSS is appended to
`app/globals.css`; no new runtime dependency is introduced.

## Not implemented / needs verification or approval

- Verify every CSV field and PDF page reference against authoritative `denda.pdf`.
- Confirm tariffs, charging units, missing passenger band, evidence requirements,
  operator assignments, and approval workflow with the owner.
- Berita Acara PDF per operator is not built yet (CSV export and the printed
  summary already work from real data).
- Operator mapping is still the fleet-prefix rule; no mapping editor exists.

## Data design (implemented, migration 0010)

Implemented tables: `spm_violation_rates` (seeded from the demo CSV, all rows
`is_verified = false`), `spm_import_batches`, `spm_findings` (partial-unique
deduplication; the six demo status values), and `spm_penalties` (frozen
snapshots). Permissions `spm.view` / `spm.manage` are mapped in the access
matrix (see [Auth, RBAC & RLS](08-auth-rbac-rls.md)). Operator is derived from
the fleet number: `A###` → Operator A, `J###` → Operator B; other prefixes cannot
enter a determination. See [Database Schema](07-database-schema.md).
