# Contributing to FIMO

OMS is an internal system maintained by a small team. This document describes the
working conventions so changes stay consistent and verifiable.

## Development setup

See [docs/14-local-development.md](docs/14-local-development.md). In short:
Node.js >= 24, `npm install`, copy `.env.example` to `.env.local`, `npm run dev`.

## Branching & commits

- Work happens on short-lived branches off `main`; do not commit directly to
  `main` for feature work.
- Commit messages: imperative, scoped where useful — e.g.
  `feat(branding): …`, `fix(claim): …`, `docs: …` (the history on `main` follows
  this pattern).
- One logical change per commit; schema + its SQL test + the code using it belong
  in the same change.

## Change workflow

For any module change, in this order:

1. **Spec** — confirm the expected behaviour against the legacy application
   (Branding v2.0 / subsiditrack) or the owner's written brief. Legacy behaviour
   is the benchmark; deviations need an explicit decision (log it in
   [docs/19-architecture-decisions.md](docs/19-architecture-decisions.md)).
2. **Schema** — new ordered migration in `supabase/migrations/` + matching suite
   in `supabase/tests/`. Never edit an applied migration.
3. **API** — route handlers under `app/api/`, each starting with
   `apiContext('<permission>')`.
4. **UI** — server components by default; reuse `components/` and the dashboard
   kit before adding new components.
5. **Tests** — extend the E2E suite (`scripts/e2e-*-test.py`) for new behaviour.
6. **Verify** — `npx tsc --noEmit` and `npx next build` both pass; SQL suite and
   relevant E2E suites green against staging.
7. **Deploy to staging** and have the change reviewed there before it is called
   done. Production releases are a separate, explicit owner decision.

## Code conventions

- TypeScript strict; no `any` without a reason.
- Money: `numeric(20,2)` in SQL, integer-safe arithmetic in TS, display via
  `formatRupiah`. Dates for business logic in `Asia/Jakarta`.
- Authorization: pages `requireContext(...)`, APIs `apiContext(...)`; RLS
  policies via `has_permission(...)`. The service-role client is for account
  administration and signed URLs only.
- Styling: vanilla CSS variables in `app/globals.css`; dark/light parity for
  every visual change; respect `prefers-reduced-motion`.
- UI copy: Indonesian. Code/docs: English. Domain terms stay Indonesian.

## Security rules

- Never commit `.env.local`, `.dev.vars`, keys, tokens, or database dumps.
  Only `.env.example` (placeholders) is tracked.
- Treat every file under `prep/` as reference material, not as a place for
  credentials.
- Report suspected secret exposure immediately — removing a file from the working
  tree does not remove it from git history.

## Documentation

Behaviour changes update the matching page in `docs/` in the same change.
Status labels (`IMPLEMENTED` / `PARTIAL` / `PLANNED` / `BLOCKED`) must reflect
reality; when in doubt, check the code, not the previous doc text.
