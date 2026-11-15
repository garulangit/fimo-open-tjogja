# 13 — Environment Configuration

## Variables

| Name | Where | Secret? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, `.dev.vars`, `wrangler.toml` `[vars]` | No | Supabase project URL for the target environment. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same | No — public by design (RLS-protected anon/publishable key) | Browser/session client key. Safe to ship in client code and in `wrangler.toml`. |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, `.dev.vars`, Worker **secrets** only | **Yes** | Admin client: account management, private storage, signed URLs. Bypasses RLS. |

Rules:

- The service-role key must **never** appear in `wrangler.toml`, in the repository,
  in client code, or in chat/tickets. `.env.example` lists names with placeholders
  only.
- `.env.local` and `.dev.vars` are git-ignored (`.gitignore` covers `.env*` and
  `.dev.vars`).
- Each environment (staging/production) uses **its own** Supabase project and keys;
  staging values must never be reused for production.

## Files

| File | Role |
|---|---|
| `.env.example` | Template with placeholders (the only env file in git). |
| `.env.local` | Next.js local dev + local `next start` smoke tests. |
| `.dev.vars` | Wrangler/OpenNext local + the E2E scripts' source of `SERVICE_KEY`/`SUPA_URL` in this workspace. |
| `wrangler.toml` | Worker `oms-staging`: entry `.open-next/worker.js`, assets binding, `compatibility_date 2025-09-01`, `nodejs_compat`, `[vars]` with the **public** Supabase URL + publishable key of the staging project. |

## Test/script-only variables

The Python suites read `OMS_BASE` (target base URL), `SUPA_URL`, and `SERVICE_KEY`
(the service-role key) from the environment — never hard-code them.

## Timezone

Business logic assumes `Asia/Jakarta`. Nota Dinas numbering/signing dates are
computed in that timezone (a UTC bug here was fixed in 0.2.0).

## Environments

| Environment | Worker | Address | Supabase | Wrangler config |
|---|---|---|---|---|
| Staging | `oms-staging` | `oms-staging.your-staging.workers.dev` | `oms-storage` (Tokyo) | `wrangler.toml` |
| Preview (FIMO candidates) | `fimo-preview` | `fimo-preview.your-staging.workers.dev` | `oms-storage` (staging data) | ad-hoc |
| Production — primary (FIMO) | `fimo-prod` | `fimo.example.com` | `oms-prod` (Sydney) | `wrangler.prod.toml` (name overridden at deploy) |
| Production — legacy (OMS brand) | `oms-prod` | `fimo.example.com` | `oms-prod` (Sydney) | `wrangler.prod.toml` |

The two production Workers serve the **same database**; they differ in build
(FIMO build vs pre-rebrand build) and branding. Client bundles embed the
`NEXT_PUBLIC_*` values of the environment they were built for — always verify
the embedded Supabase host in the bundle before deploying (a staging/prod swap
here is silent and dangerous).
