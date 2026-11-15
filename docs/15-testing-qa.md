# 15 — Testing & QA

Testing is layered; a change is reported as working only with the evidence of the
relevant layers passing.

## Layer 1 — SQL test suites (`supabase/tests/`)

Run against the target Supabase project after applying migrations. They assert
permissions matrices, RLS denials, guard behaviour, and business invariants inside
the database itself.

| Suite | Covers | Result |
|---|---|---|
| `0001_foundation_auth_test.sql` | Role/permission matrix (28/22), escalation denials, last-superadmin guards, append-only audit | 17/17 |
| `0002_branding_test.sql` | Branding schema, RLS by permission, pricing/conflict foundations | 16/16 |
| `0003_claim_test.sql` | Claim schema, calculation inputs, workflow guard | 15/15 |
| `0004_booking_exclusivity_test.sql` | One-active-booking-per-bus-per-period | 5/5 |
| `0005_booking_reference_test.sql` | Reference format/backfill/nullability | passing (in E2E-verified migration run) |

## Layer 2 — End-to-end suites (`scripts/`)

Python suites driving the real HTTP app (login, forms, APIs, PDFs) with
self-managed fixture users. Current totals against staging: **auth 25/25,
branding 28/28, claim 22/22, module-access 15/15, spm 18/18, storage 9/9,
search 21/21, feature-access 16/16, total-override 18/18,
workspace-shortcuts 11/11, custom-role 13/13, login-guard 12/12, upload-limits 9/9, claim-revenues-30 8/8, claim-save-integrity 13/13, claim-numbering 6/6, claim-verification 14/14**. App traffic in the newer suites goes through
`curl` (Python `urllib` proved unreliable through the sandbox egress proxy);
fixture creation via the Auth Admin API is always confirmed afterwards by
SQL because a lost response can still mean the user was created.

They cover, among others: forced password change, superadmin reset/deactivation,
booking conflicts and multi-bus reference sharing, nota FINAL immutability and PDF
output, claim two-level validation (submit without documents succeeds with an audit
note), summary CSV content, and permission denials for the `admin` role.

## Layer 3 — Build gates

- `npx tsc --noEmit` and `npx next build` must **both** pass (a bundler-only pass
  once hid a real type error in this project's history; see the repo's
  typescript-verification practice).
- OpenNext Worker build must complete before any deploy.

## Layer 4 — Visual smoke

Dashboard/page changes are verified by rendering the page with real staging data
(local `next start` against the staging database, authenticated fixture session)
and inspecting the output — plus owner review on the staging URL before a round is
called finished.

## Practices

- E2E fixtures clean up after themselves (users, bookings, claims created by a run
  are removed or clearly labelled test data).
- Suites run against **staging only**, never production.
- Regressions: any fix ships with the full relevant suite re-run, not just the new
  check.
