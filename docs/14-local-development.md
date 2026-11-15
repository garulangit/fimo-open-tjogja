# 14 — Local Development Setup

## Prerequisites

- Node.js **>= 24** (repo `.nvmrc`: `24`; `package.json` engines `>=24`).
- Access to a Supabase project (development uses the staging project
  `oms-storage` unless you run your own).
- Python 3 for the SQL/E2E tooling (suites are plain `urllib` scripts, no pip deps).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL, publishable key, service-role key
npm run dev                  # http://localhost:3000
```

Sign in with an account created by a superadmin (or bootstrap the first superadmin —
see below). Public sign-up is disabled by design, so there is no self-registration
flow to test.

## Database changes

1. Add an ordered migration: `supabase/migrations/YYYYMMDDNNNN_name.sql`.
2. Add/extend its SQL test suite: `supabase/tests/NNNN_name_test.sql`.
3. Apply to the staging project first (Supabase Management API / SQL editor),
   run the SQL suite until green, then build the API/UI on top.
4. Never edit an already-applied migration; supersede it with a new one
   (0004 superseding parts of 0002 is the in-repo example).

## First superadmin (bootstrap)

For a fresh project: create the auth user (username mapped to
`<username>@oms.internal`), insert its `profiles` row via the `handle_new_user`
trigger path, assign the `superadmin` role in `user_roles`, and set
`must_change_password`. The user then signs in and is forced to set a real password.
After bootstrap, all account management happens in the app.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server. |
| `npm run build` | Production build (must pass together with typecheck). |
| `npx tsc --noEmit` | Typecheck — a change is not "done" unless both pass. |
| `npx opennextjs-cloudflare build` | Build the Worker bundle. |
| `npx wrangler deploy` | Deploy to staging. |

## Verification before calling anything done

```bash
# E2E suites (staging or a local `next start` against staging data)
OMS_BASE=<base-url> SUPA_URL=<supabase-url> SERVICE_KEY=<service-role-key> \
  python3 scripts/e2e-auth-test.py      # 25 checks
OMS_BASE=<base-url> SUPA_URL=<supabase-url> SERVICE_KEY=<service-role-key> \
  python3 scripts/e2e-branding-test.py  # 27 checks
OMS_BASE=<base-url> SUPA_URL=<supabase-url> SERVICE_KEY=<service-role-key> \
  python3 scripts/e2e-claim-test.py     # 22 checks
```

The suites create and delete their own fixture user (`e2e_super`, superadmin via
`user_roles`) — never point them at production.
