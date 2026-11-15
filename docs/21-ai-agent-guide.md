# 21 — AI Agent Onboarding Guide

For AI coding agents (and new humans) starting work in this repository. The
repo-root [`AGENTS.md`](../AGENTS.md) carries the binding working rules; this guide
explains the mental model behind them.

## Read first

1. [Overview](01-overview.md) and [Architecture](02-architecture.md) — the shape of
   the system.
2. The module doc for the area you will touch ([Branding](03-module-branding.md) /
   [Claim](04-module-claim.md)).
3. [Auth, RBAC & RLS](08-auth-rbac-rls.md) — before writing any route or query.
4. The migration + SQL test of the tables you will touch.

## Mental model

- **Three enforcement layers** (UI, server guard, RLS) must stay consistent. When
  you add a route: pick its permission code, guard it with `apiContext(...)` /
  `requireContext(...)`, and make sure an RLS policy using `has_permission(...)`
  covers the tables it touches.
- **The session client is the default.** `createClient()` (session) keeps RLS in
  force. The service-role client (`lib/supabase/admin.ts`) bypasses RLS — use it
  only for account administration and signed-URL minting, after a permission check.
- **Business rules live twice on purpose**: TypeScript domain modules (`lib/
  branding.ts`, `lib/claim.ts`) for UX/preview, and database triggers/functions as
  the enforcer. If they disagree, the database is right — fix the TypeScript.
- **Snapshots are sacred.** Never recompute a stored `pricing_snapshot` or a claim
  version after creation.
- **Money** is `numeric(20,2)` in SQL and formatted with `formatRupiah` in TS.
  No floats for money, ever.
- **Time** is `Asia/Jakarta` for business dates.

## Change workflow (per module, in order)

spec from legacy behaviour → migration + RLS + SQL tests → API routes → UI →
E2E checks → staging deploy → owner review. Do not skip the SQL test layer when you
touch the schema, and do not declare success without running the suites
([Testing & QA](15-testing-qa.md)).

## Hard rules

- Production is never touched without a separate explicit owner approval.
- Never commit secrets; only `.env.example` (placeholders) is tracked.
- No new runtime dependencies without a clear need and owner awareness.
- Keep the legacy repositories untouched — they are read-only references.
- Match the existing code style: server components by default, vanilla CSS,
  minimal surface area per change.

## Where things are

Code map: [Architecture — Repository structure](02-architecture.md#repository-structure).
API surface: [API & RPC Reference](09-api-reference.md). Schema:
[Database Schema](07-database-schema.md). Failure modes:
[Troubleshooting](18-troubleshooting.md).
