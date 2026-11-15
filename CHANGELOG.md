# Changelog

All notable changes to FIMO are recorded here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions correspond to `package.json` and to the commit history on `main`.

## [1.2.3] — 13 Nov 2026 (stable)

Denda SPM: automatic reconciliation for trouble findings (owner pattern).
Live in production 13 Nov 2026 (pre-release backup
`oms-prod-20261113-092827.zip`; migration 0019 applied to production,
SQL suite ALL PASS there, Dishub-duration backfill = 135 rows).
This bundle also carries v1.1.8 (navigation cleanup) into production.
The Agent module code (v1.2.0) ships in the same build, but the module
stays unconfigured in production — `/api/agent/ask` answers 503
("Agent belum dikonfigurasi di server") until the production Bridge
wiring lands as its own step.

- Migration 0019 adds two-sided stop/resume times to `spm_findings`
  (Dishub 01/02 → duration 03; Operator 04/05 → duration 06, computed
  server-side at import, midnight crossover handled) and three statuses:
  `Klarifikasi Diajukan`, `Disetujui`, `Disanggah`. Dishub durations are
  backfilled from the existing narrative text ("NNN Menit", 135 rows).
- Operator import now reconciles automatically: an OP-006 finding whose
  operator duration is under 3 hours becomes `Klarifikasi Diajukan`
  (handled fast enough — drops out of penalty determination); 3 hours or
  more stays on the violation track. The import response reports matched /
  clarified / still-violation counts.
- Human decision is two buttons only — **Disetujui** / **Disanggah** —
  no status dropdown. Penalty determination accepts `Disetujui` only
  (replacing `Verified`).
- Reconciliation page: import-history table gains a page-size selector
  (5/10/25/100/All) with global row numbering and paging; the findings
  comparison is grouped by a per-month selector with counts, and shows
  Dishub vs Operator stop durations for OP-006.
- Staging verification: SQL test 0019 ALL PASS; `e2e-spm-rekon` 22/22 on
  a staging copy of the production SPM data (30 batches / 636 findings).

## [1.2.0] — 13 Nov 2026 (staging); **activated in production 14 Nov 2026**

New module: **Agent** — an in-app chat assistant over operational data.
Production activation (14 Nov 2026, configuration only — no code change):
pre-activation backup `oms-prod-20261114-202710.zip` (36 tables, 3,646
rows); migration 0018 applied to production with its SQL suite passing;
the Bridge on self-hosted server now routes per environment by bridge key
(staging key → staging DB, production key → production DB, one process,
one tunnel); `AGENT_BRIDGE_URL`/`AGENT_BRIDGE_KEY` secrets set on the
production Worker. Verified end-to-end: direct Bridge checks (production
18 claims vs staging 1; module guard rejects out-of-scope questions with
zero queries; wrong key 401) and a live website smoke (temporary
superadmin asked via https://fimo.example.com/agent — HTTP 200,
`agent.ask` audit row written; fixture deleted afterwards). Known
quality note: the model (glm-4.7-flash) is non-deterministic and
occasionally date-filters a counting question; a re-ask returns the
correct totals (18 claims, 182 bookings).

- Chat page `/agent` (guard: `agent.use` from the module matrix), sidebar
  entry and mobile bottom-nav tab; attach a text/CSV file as context;
  result sets render as a downloadable CSV card. The conversation carries a
  permanent notice that chats are recorded for company audit.
- API route `/api/agent/ask` computes the caller's data scope server-side
  from the module matrix and forwards the question to the FIMO Bridge on
  self-hosted server, which invokes the dedicated Agent profile and executes
  read-only SQL. Every question is written to `audit_events` via
  `log_audit` (question + scope + queries; answers are not stored).
- Migration 0018 completes the agent DB contract (0009): adds the combined
  read-only role `fimo_ro_branding_klaim` and grants the bridge login role
  membership in all scope roles so each query transaction can
  `SET LOCAL ROLE`. Scope is enforced by PostgreSQL itself, never by the
  prompt: a Branding-only account's claim queries are rejected by the
  database.

Automatic SPM reconciliation (owner pattern, 13 Nov): for OP-006 (trouble),
an operator import with duration < 180 minutes moves the finding to
**Klarifikasi Diajukan** (dropped from determination); exactly 180 minutes
stays a violation.

- Migration 0019 adds `dishub_stop_at` / `dishub_resume_at` /
  `operator_stop_at` / `operator_resume_at` ("HH:MM") and
  `dishub_duration_min` / `operator_duration_min` to `spm_findings`, plus
  the statuses `Klarifikasi Diajukan`, `Disetujui`, `Disanggah`; Dishub
  durations were backfilled from the "NNN Menit" pattern in the description
  (135 rows, min 183, avg 426 minutes). Durations are computed server-side
  on import (resume before stop counts as past midnight, +24h).
- Operator import matches findings (date + fleet + code), stores the
  operator times, and applies the 3-hour rule immediately; the response
  reports matched · clarified · still-violation counts.
- Determination (`POST /api/spm/penalties`) now requires status `Disetujui`
  instead of `Verified`.
- Reconciliation UI: the status dropdown is gone — decisions are two buttons,
  **Disetujui** and **Disanggah** (a reason goes in the explanation column);
  OP-006 rows show Dishub vs operator durations side by side. The dashboard
  counts the new categories.

## [1.1.8] — 12 Nov 2026 (staging)

Navigation cleanup (owner request): configuration/reference pages no
longer appear inside module menus — module menus are work/input only.

- Branding menu drops Pricelist, Claim menu drops Master Data, SPM
  menu drops Besaran Denda. All three live in the Setting section
  (Pricelist & Tarif and Master Data Klaim were already listed there;
  Besaran Denda SPM is newly added, gated by spm.view/spm.manage and
  the spm.rates feature flag). Routes and pages are unchanged.

## [1.1.7] — 12 Nov 2026 (stable)

Verified (disbursed) amounts per claim line, requested by the operations team and
approved by the owner. Until now the review flow could only approve a
claim at its proposed amounts, while the source workbooks carry a
separate verified amount per cost item and revenue row.

- Migration 0017: `verified_amount` on `claim_items` and
  `claim_revenues` (nullable, CHECK >= 0), plus
  `total_verified_operational_cost`, `calculated_verified_subsidy`,
  and `verified_at` on `claims`. Proposed amounts are never
  overwritten; both live side by side.
- New `verified` action on the claim API (permission
  `claim.claim.verify`, IN_REVIEW only): validates every value up
  front (0..proposed), one bulk upsert per table, post-write
  read-back verification, then `recalcVerifiedClaim` recomputes the
  header totals with the same formula as the proposed totals.
  Resubmitting a revised claim clears the previous round's verified
  values (kept in the version snapshot).
- Claim detail shows Usulan | Verifikasi | Tidak Cair per item and
  per revenue row (editable form for verifiers while IN_REVIEW,
  read-only afterwards) plus verified summary KPIs; the verify queue
  lists proposed vs verified subsidy and the undisbursed remainder.
- Verified formula proven against the source data before building:
  Feb AMI, Mar AMI, and Feb JTT verified subsidies reproduce to
  Rp 0,00 from the per-item values.

## [1.1.6] — 12 Nov 2026 (stable)

Claim creation numbering fix. The next claim number was computed as
COUNT + 1 over the series prefix and the count query's error was
ignored (falling back to seq 1). After CLM-D-2026-0001 was deleted
from production, the count dropped below the highest existing number,
so every new claim was assigned CLM-D-2026-0005 and rejected with
"duplicate key value violates unique constraint
claims_claim_number_key".

- Next number is now MAX(existing sequence) + 1 for the prefix, so
  gaps left by deleted claims never reuse an old number.
- A failed numbering read aborts creation with an explicit error
  instead of guessing a number.
- Insert retries up to 5 times on unique_violation (23505),
  recomputing MAX each time, so concurrent creates cannot collide.

## [1.1.5] — 12 Nov 2026 (stable)

Claim save integrity fixes, found by the CLM-D-2026-0002 pilot entry
(17 of 30 item values persisted, 13 silently reverted to 0, header
totals stayed Rp 0, and validation still declared the claim
submittable).

- **Root cause (verified on staging): one save request issued 52
  sequential per-item database calls.** The calls at the tail of the
  queue failed (per-request subrequest budget on the Workers
  platform; failure count varied run to run, 13–17 of 52), and the
  old code ignored every error — values vanished silently and
  `recalcClaim`'s own per-item status updates plus its header-total
  update died in the same queue, leaving the summary at Rp 0.
- **Items save is now batched and cannot drop values silently.** All
  values are validated first (one invalid value rejects the whole
  save with an explicit per-code error, nothing is written), then a
  single bulk upsert writes every item, then a post-write
  verification re-reads all items and compares them field-by-field
  with the submitted values. The success banner is only shown after
  verification passes.
- **`recalcClaim` batches and verifies.** Completion-status updates
  are grouped into one call per status value; the header-totals
  update is error-checked, and the stored totals are re-read and
  compared against the computed totals — any mismatch returns
  `null`, which callers now surface as an explicit error instead of
  success (the meta action follows the same pattern). This closes
  the "items saved but summary cards Rp 0" failure.
- **Validation now checks the money.** A claim whose computed
  operational cost is Rp 0, or whose stored header totals are
  inconsistent with the saved items/revenues, gets a blocking error;
  the detail page already disables "Ajukan untuk Verifikasi" while
  blocking errors exist, so an empty or inconsistent claim can no
  longer be declared submittable.

## [1.1.4] — 12 Nov 2026 (stable)

Claim revenue form rows raised from 10 to 30 (owner request, urgent:
2026 subsidy claims need up to 20 revenue rows per claim).

- One shared constant `REVENUE_FORM_ROWS = 30` in `lib/claim.ts` now
  drives both the detail-page form (`Array.from`) and the server
  action loop that deletes + re-inserts `claim_revenues`, so the two
  can never drift apart again. No schema change.
- Verified: E2E `claim-revenues-30` (8/8) — the form renders 30 rows;
  20 rows saved on a DRAFT claim persist exactly (ticket Rp12.000.000
  + branding Rp9.000.000 = Rp21.000.000), subsidy recalculates to
  Rp86.000.000 on a Rp107.000.000 operational total, a full 30-row
  save also persists, and an existing claim is untouched.

## [1.1.3] — 12 Nov 2026 (stable)

Upload size limits raised (owner specification, 12 Nov).

- Branding admin documents: PKS 2 MB → **5 MB**; Invoice, Bukti
  Transfer, Kwitansi, Faktur Pajak 500 KB → **2 MB**.
- Bus photos: 500 KB → **1 MB**.
- Claim requirement documents: uniformly 15 MB → **20 MB** (migration
  0016: column default plus all 735 existing requirement rows; the
  route fallback default follows).
- Verified: SQL suite 0016 (2/2), E2E `upload-limits` (9/9) with real
  uploads on both sides of every new boundary.

## [1.1.2] — 12 Nov 2026 (stable)

Login guard (migration 0015). Deployed to staging first, then to
production the same morning on owner approval (migration 0015 applied to
the production database after a full backup).

- **Login rate limiting, in-app**: every sign-in attempt is recorded
  (`login_attempts`, service-role only). After 10 failures per username —
  or 50 per IP — inside a 15-minute window counted since the last success,
  further attempts are refused with a "terkunci" message until the window
  slides. The IP bound is deliberately loose because one office shares a
  single NAT address.
- **Maximum 9 active sessions per account**: a new sign-in revokes the
  oldest sessions beyond nine (`prune_user_sessions()`).
- **20-hour maximum session age**: middleware checks the session's birth
  (`my_session_created_at()`); older sessions are signed out via
  `/api/auth/expired` and land on the login page with a session-ended
  message.
- Verified: SQL suite 0015 (7/7), E2E `login-guard` (12/12), auth
  regression (25/25).

## [1.1.1] — 11 Nov 2026 (stable)

First feature release on top of the 1.0.1 production baseline. Everything
below was built and verified on staging first (each item has a passing E2E
suite), then released to production as one version.

- **Custom role for new accounts** (migration 0014, added later the same
  night; briefly labelled 1.1.2 in production, then unified back into
  1.1.1 by owner decision on 12 Nov): the create-account form
  gains a third role, `custom` — no preset. A custom account can sign in but
  starts with zero module access; every module, feature and Workspace
  shortcut is granted explicitly per account through the access matrix.
  The role itself carries no `role_permissions`; all access flows from the
  matrix. Verified by SQL suite 0014 (9/9) and E2E `custom-role` (13/13).

### Access control — module matrix, per-feature checkboxes (migrations 0008, 0012)
- Per-account module access matrix (Read/Write per module) replacing static
  role templates; roles remain as presets. `has_permission()` resolves role,
  matrix, and feature layers in the database.
- Per-submenu feature checkboxes (`user_feature_access`): a module or submenu
  that is not granted does not render in navigation at all; an account with
  no grants sees an empty shell. PhotoStamp became a grantable module.
- Redesigned matrix UI (per-module cards, switches, sticky save bar).
  User Management now lives inside the **Setting** navigation group.
- GRANT-type features (migration 0013): opt-in checkboxes that *add* a
  permission instead of subtracting one; they never switch on via presets.

### Global search (no migration)
- Permission-aware search across fleet, bookings, nota dinas, admin docs,
  claims, SPM findings/rates, workspace shortcuts, and users (`/api/search`,
  `/search` page, header search with grouped suggestions + subtitles).
- Entity spotlight: an exact fleet/plate query opens a bus card with its
  bookings. Per-module filters on bookings (incl. a dedicated
  **fleet-number (nomor lambung)** search box), fleet, claims, and SPM
  reconciliation; booking search pierces the default hide-completed rule.

### Branding — negotiated total override (migration 0013)
- `branding_total_adjustments` ledger: a negotiated group total is stored as
  a **locked ratio** (agreed ÷ pricelist at save time) with a mandatory
  reason and full audit trail. Snapshots and the pricelist are never mutated.
- Effective totals (snapshot × active ratio) flow into the transaction
  table, branding overview, dashboard resume, reports, history, and both
  letters (penawaran/konfirmasi). Two-step popup (edit → confirm summary),
  per-group history, and revoke. Gated by the opt-in matrix checkbox
  "Override Total (Nego)" (`branding.total.override`); superadmin holds it
  by role.

### SPM backend (migration 0010)
- Real persistence for Denda SPM: violation-rate master (53 seeded rows,
  unverified until the official tariff arrives), two-sided CSV import
  (Dishub vs operator), reconciliation, and frozen penalty determinations
  via `/api/spm/*`. The SIMULASI labels were removed.

### Storage — self-hosted MinIO backend (migration 0011)
- Per-file `storage_backend` switch; SigV4 client with zero new runtime
  dependencies. Staging runs on MinIO at self-hosted server behind
  `files.example.com` (Cloudflare Tunnel); production keeps the
  Supabase backend until its separate cut-over.

### AI agent database contract (migration 0009)
- Nine `agent_*` read-only views, three NOLOGIN read-only roles per scope,
  forced read-only + 60 s statement timeout. Pilot login is provisioned
  out-of-band; no credentials live in the repo.

### Workspace — per-shortcut checkboxes (no migration)
- Every Application Hub app (8) and Work Drive document (4) has its own
  matrix checkbox under the Workspace card; catalog pages and global search
  honour per-shortcut visibility (group AND shortcut must be granted).

## [Unreleased]

### FIMO rebrand, mobile shell & repository consolidation (10 Nov 2026)
- **Rebrand OMS → FIMO** (Fleet Integrated Management & Operations): login page,
  sidebar, page titles, footer, and the claim summary PDF header now carry the
  FIMO brand. Primary production domain moved to `fimo.example.com`
  (Worker `fimo-prod`); `fimo.example.com` keeps running the pre-rebrand
  build on the same database.
- **Mobile app shell**: new Home page (`/home`) with module tiles, a 5-tab
  bottom bar (Home, Branding, Claim, SPM, App) whose module tabs open tile
  sheets, a swipeable navigation drawer (horizontal gestures via
  `touch-action: pan-y`), and an installable **PWA** (manifest + service
  worker; start URL `/home`). Desktop layout unchanged.
- **Workspace modules shipped**: Application Hub and Work Drive launchers
  (static catalog, superadmin-gated) — see docs/22.
- **Denda SPM simulation prototype shipped** in the build (superadmin-gated,
  labelled SIMULASI; frontend-only, no persistence) — see docs/06.
- **`main` consolidated**: the v2 line was adopted as `main` in the morning
  (`0c7e9e1`), and the FIMO production build (branch
  `2026-11-10-demo4-fimo-mobile`) was merged into `main` the same evening
  (PR #1) after a full-tree comparison proved zero file loss. `main` is again
  the single deploy source of truth.
- **Automatic backups installed** for both Supabase projects (verified archive
  zips, restore-tested 30/30 tables, local + Google Drive copies, scheduled).

### Production preparation (9 Nov 2026, pre-go-live audit fixes)
- **Photo Stamp overtime: third-party scripts vendored locally.** The static
  app previously loaded jsPDF 2.5.1 (cdnjs) and ExifReader 4.23.5 (jsdelivr)
  from CDNs without SRI while running on the app origin. Both libraries are
  now served from `public/photo-stamp-overtime/vendor/` (downloaded from the
  exact URLs the page referenced); no external script remains in the page.
- **HTTP security headers**: `next.config.ts` now sends `X-Frame-Options:
  SAMEORIGIN`, CSP `frame-ancestors 'self'`, `X-Content-Type-Options:
  nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin` on all
  routes.
- **Vendored dependency record — JSZip**: the branding letter (DOCX)
  download uses **JSZip v3.10.1** (Stuart Knightley, dual MIT/GPLv3; source
  https://stuk.github.io/jszip/), vendored at `lib/vendor/jszip.min.js` and
  loaded through the `lib/vendor/jszip.ts` wrapper. It is deliberately not
  an npm dependency; this entry is its provenance record (per AGENTS.md rule
  8 exception, recorded during the 9 Nov 2026 production audit, item M3).
  The license text ships at `lib/vendor/JSZip-LICENSE.txt`.

### Added
- **Dashboard redesign** (commit `ba93e3f`): the three dashboards (main, Branding
  overview, Claim overview) rebuilt on a shared dashboard kit
  (`components/dashboard/Dash.tsx`) with patterns adapted from Tabler (MIT) —
  KPI cards with sparklines, SVG bar/donut charts, activity tables, all fed by
  real data; Branding and Claim money always presented separately.
- **Dashboard polish round**: charts now animate on page open (bar grow, donut
  sweep, sparkline draw, KPI count-up — patterns ported from the legacy Branding
  v2.0 dashboard, cubic ease-out ≈ 820 ms); y-axis gridlines and tick labels;
  compact horizontal KPI cards with per-tone coloured icon chips (light mode
  full-colour); KPI grids widened so currency values never overflow.
- **Repository documentation**: full `docs/` tree (architecture, modules,
  schema, auth/RBAC/RLS, API reference, workflows, design system, deployment,
  migration, ADRs, roadmap, AI-agent guide), plus `AGENTS.md` and
  `CONTRIBUTING.md`.

### Fixed
- **Revenue undercount on dashboards**: 92 of 184 migrated bookings had no
  `pricing_snapshot` (none existed in the legacy Firestore data), and the
  dashboards sum stored snapshots only, so half the portfolio silently counted
  as Rp 0 (2026 revenue allocation showed Rp 2.68 B instead of Rp 8.09 B).
  Snapshots for all 92 bookings were backfilled with the official pricing
  engine against the original pricelist; the replica used for the backfill was
  validated against the 92 existing snapshots first (all money fields matched;
  legacy `monthlyRevenue` floats are stored rounded, per the current engine).
- **Pricelist overwritten by the Branding E2E suite**: the suite deleted all
  `branding_pricing_config` rows and published its test matrix without
  restoring the real one. The original "Angkutan Perkotaan - Medium" pricelist was
  restored as config v2, and the suite now snapshots the active config before
  the run and restores it during cleanup (new check: 28/28).
- **Bus master enrichment** (migration `202611090006`): `branding_buses` gains
  `operator` (`AMI`/`JTT`), `route_name`, and `route_detail`, loaded from the
  office's official bus database (130 buses). One ETL-era orphan bus
  (AB 7330 AK, absent from the office master) is retained because a booking
  references it.

## [1.0.1] — 2026-11-09

UI/UX revision per owner brief (commit `61ebbda`); Nota Dinas official format
(commit `ed0f457`).

### Added
- Group **Reference Numbers** for bookings (migration `202611090005`,
  `REF-YYYYMM-XXXXXXXX`, backfilled): multi-bus submissions share one reference,
  shown consistently across booking tables, document/Nota Dinas pickers
  ("Reference — Company — Period"), letters, Nota Dinas PDFs, and reports.
- Multi-bus booking creation with a searchable bus picker; all-or-nothing
  conflict validation.
- Two-level claim validation: hard blockers vs document-completeness warnings
  (recorded in the audit trail); automatic summary CSV download after claim
  create/submit (UTF-8 BOM, formula-injection safe).
- Nota Dinas regenerated in the **official example format**: rich-text PDF
  builder, grouped detail table per Reference Number, amount-in-words,
  payment deadlines (single or 3 stages), attachment with terms and route list.
- Footer watermark on every page; account menu in the header (change password /
  sign out); animated sun/moon theme toggle.

### Changed
- Login titled "Operational Management System" with the official help line
  "Lupa password? Hubungi Admin."
- Sidebar restructured into Dashboard / Modul / Manajemen User / Setting;
  modules renamed Branding FIMO, Klaim Subsidi, PhotoStamp (direct link),
  Denda SPM (placeholder, last). Setting lists only real functions.
- Branding and Claim overviews redesigned as SaaS-style dashboards on real data.
- Node.js pinned: `engines >= 24` + `.nvmrc`.

### Fixed
- Delete-confirmation modal rendered through a portal at viewport level
  (previously trapped by a page transform).

## [0.4.0] — 2026-11-08

### Added
- Official FIMO logo (owner-provided SVG; commit `392ace9` replaced the
  earlier traced version), adaptive in dark mode; new favicon set.
- Post-login loading splash; login mascots ported from legacy Branding v2.0
  (gaze tracking, look-away while typing the password, show/hide password eye).
- In-app delete confirmation modal for all destructive actions.
- Collapsible sidebar module groups (persisted; active module always open).
- Photo Stamp module activated: FIMO-Stamp V2 embedded at `/photo-stamp`
  inside the OMS shell.

### Changed
- **Booking exclusivity (migration 0004, owner decision):** one active booking
  per bus per period regardless of placement; the legacy Side/Back zone
  coexistence rule is retired. SQL suite 0004: 5/5.

## [0.3.0] — 2026-11-08

### Added
- **Claim module** (migration `202611080003`, 11 `claim_*` tables): master data,
  exact legacy calculation port (per-item tax modes, profit %, subsidy formula,
  `numeric` money), guarded 7-state workflow (transition trigger), version
  snapshots at submission, evidence PDFs in the private `claim-docs` bucket,
  claim letter PDF, verification queue, master-data UI, period reports.
- Sidebar shows every module's full submenu globally (owner request), replacing
  the in-module tab strip.

### Security
- Legacy claim gaps closed: unauthenticated APIs, cross-claim IDOR, free-form
  status changes, float money, local file uploads.

## [0.2.0] — 2026-11-08

### Added
- **Branding module** (migration `202611080002`, 8 `branding_*` tables, RLS by
  foundation permissions; SQL suite 16/16): bus master, bookings with
  transactional conflict enforcement, server-side pricing engine with frozen
  snapshots (duration tiers, SIDE_BODY = Left + Right, PPN), versioned pricelist,
  Nota Dinas with automatic legacy-format numbering and FINAL immutability,
  admin documents in the private `branding-docs` bucket with signed URLs, bus
  photos, Surat Penawaran & Surat Konfirmasi PDFs (pdf-lib), dashboards and
  reports. E2E branding 24/24 at release (27/27 after 1.0.1).

### Fixed
- Nota Dinas numbers and signature dates computed in `Asia/Jakarta` (were UTC).

## [0.1.0] — 2026-11-08 (foundation, commits 2026-11-07)

### Added
- Platform foundation (migration `202611080001`): `profiles`, `roles`,
  `permissions`, `role_permissions`, `user_roles`, `module_registry`,
  append-only `audit_events`; RLS default-deny; centralized `has_permission()`
  / `is_superadmin()`; `log_audit()` RPC. 28 permissions seeded
  (superadmin 28, admin 22). SQL suite 17/17.
- Application: username+password login (Supabase Auth SSR cookies), route
  middleware, forced first-login password change, change/reset password,
  superadmin user management — E2E auth 25/25.
- Hosting spike (see `SPIKE-RESULTS.md`): OpenNext adapter selected; pdf-lib
  generation/merging verified on Cloudflare Workers.

### Security
- Public sign-up disabled; last-superadmin demotion/deactivation guards;
  profile sensitive-column guard; deactivation voids all permissions.
