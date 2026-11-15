# AGENTS.md — FIMO

Instructions for AI coding agents working in this repository. Human contributors
should also read [CONTRIBUTING.md](CONTRIBUTING.md). Full documentation lives in
[`docs/`](docs/README.md); start with the
[AI Agent Guide](docs/21-ai-agent-guide.md).

## Project in one paragraph

Next.js 16 (App Router) + React 19 + TypeScript on Cloudflare Workers (OpenNext),
backed by one Supabase project (PostgreSQL + Auth). File storage is dual-backend
since migration 0011: Supabase Storage or MinIO on self-hosted server, switched per file
by the `storage_backend` column via `lib/storage.ts` (writes follow the
`STORAGE_BACKEND` env). Modules: Branding
(`branding_*` tables), Claim (`claim_*` tables), Photo Stamp (vendored static app),
and Denda SPM (database-backed since migration 0010: CSV import, two-sided reconciliation, penalty determination with frozen tariff snapshots).
Roles are presets (`superadmin` bypass, `admin` = Branding + Claim, and
`custom` since migration 0014 = no preset, matrix-only access), 33 permission codes, RLS enforced
on every table.

## Non-negotiable rules

1. **Never touch production.** Staging (`oms-storage` Supabase + `oms-staging`
   Worker) is the only working target. Production deploys/migrations need a
   separate, explicit owner approval naming production.
2. **Never commit secrets.** `.env.local` and `.dev.vars` are git-ignored and must
   stay that way. The service-role key appears only in those files and in Worker
   secrets — never in code, docs, `wrangler.toml`, or commit messages.
3. **Authorization is three-layered.** Every new page uses
   `requireContext('<permission>')`; every API route starts with
   `apiContext('<permission>')` and returns early on `null`. Tables need RLS
   policies built on `has_permission()`. Do not add unguarded routes.
4. **Use the session Supabase client by default** (`lib/supabase/server.ts`).
   The service-role client (`lib/supabase/admin.ts`) bypasses RLS: reserve it for
   account administration and signed-URL minting, always after a permission check.
5. **Schema changes are new migrations** (`supabase/migrations/YYYYMMDDNNNN_*.sql`)
   plus a matching SQL test in `supabase/tests/`. Never edit an applied migration.
6. **Snapshots are immutable.** Do not recompute `branding_bookings.pricing_snapshot`
   or rows in `claim_versions` after creation.
7. **Money is `numeric(20,2)`**; format with `formatRupiah`. Business dates use
   `Asia/Jakarta`.
8. **No new runtime dependencies** without a clear, stated need. The current set
   (Next, React, Supabase, pdf-lib, lucide-react) is deliberate. No CSS or chart
   frameworks — vanilla CSS and hand-rolled SVG only.
9. **Do not modify the legacy repositories** (`dashboard-branding-legacy`,
   `subsiditrack`). They are read-only behavioural references.
10. **Verify before claiming done**: `npx tsc --noEmit` AND `npx next build` must
    pass; run the relevant SQL/E2E suites (`scripts/e2e-*-test.py`, staging only)
    and report actual counts.

## Working conventions

- Per-module change order: spec (from legacy behaviour) → migration + RLS + SQL
  tests → API → UI → E2E → staging deploy → owner review.
- Server components by default; client components only where interaction requires
  them (`"use client"` islands like `CountUp`, pickers, menus).
- Keep changes minimal and focused; match existing naming (`branding_*`,
  `claim_*`, permission codes `<module>.<resource>.<action>`).
- UI text is Indonesian (business UI); code identifiers and documentation are
  English. Domain terms stay Indonesian (Nota Dinas, Klaim Subsidi, Denda SPM).
- Production dashboards must use real data and render explicit empty states.
  Denda SPM stores real operational data; its tariff master seed originates from
  a CSV and stays flagged unverified in the UI until the official tariff is
  entered. Never sum Branding money with Claim money.

## Key files

| Area | File |
|---|---|
| Auth gateway | `lib/auth.ts` |
| Domain rules | `lib/branding.ts`, `lib/claim.ts` (+ `*-server.ts` pricing/calc engines) |
| PDF builders | `lib/pdf.ts`, `lib/nota-pdf.ts` |
| Dashboard kit | `components/dashboard/Dash.tsx`, `components/dashboard/CountUp.tsx` |
| Schema | `supabase/migrations/`, tests in `supabase/tests/` |
| Deploy | `wrangler.toml` |
