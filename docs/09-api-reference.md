# 09 — API & RPC Reference

All routes live under `app/api/`. Conventions:

- Every route (except `POST /api/auth/login`) requires a session cookie; middleware
  returns `401` for unauthenticated API calls.
- Every handler starts with `apiContext('<permission>')`; a failed check returns
  `403` (handler returns early on `null` context).
- Most mutations are `POST` (form-style actions, mirroring the UI forms); reads that
  produce files are `GET`. Bodies are form data or JSON as used by the pages.
- Errors are JSON `{ error: string }` with a suitable status code.

## Auth & account

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | public | Username + password sign-in (rate of attempts is an ops concern; see Troubleshooting). |
| `/api/auth/logout` | POST | session | Sign out. |
| `/api/account/password` | POST | session | Change own password (verifies current password; clears the forced-change flag). |

## Admin (superadmin)

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `/api/admin/users` | POST | `platform.users.manage` | Create account (username, display name, role, initial password). |
| `/api/admin/users/[id]` | POST | `platform.users.manage` | Reset password, activate/deactivate, change role — all audited; last-superadmin guards apply. |

## Branding

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `/api/branding/buses` | POST | `branding.bus.manage` | Create bus. |
| `/api/branding/buses/[id]` | POST | `branding.bus.manage` / `.delete` flows | Update or delete bus. |
| `/api/branding/bookings` | POST | `branding.booking.manage` | Create booking(s): accepts `bus_id` or `bus_ids[]` (multi-bus, one Reference Number); conflict-checked up front. |
| `/api/branding/bookings/[id]` | POST | `branding.booking.manage` / `delete` | Update, change status, or delete booking. |
| `/api/branding/bookings/[id]/surat` | GET | `branding.booking.view` | Surat Penawaran / Surat Konfirmasi PDF for the booking. |
| `/api/branding/pricing` | POST | `branding.pricing.manage` | Publish a new pricelist version / VAT config. |
| `/api/branding/documents` | POST | `branding.documents.manage` | Create admin record / upload admin document (size/type validated). |
| `/api/branding/documents/[id]` | POST | `branding.documents.manage` | Update or delete document/record. |
| `/api/branding/photos` | POST | `branding.documents.manage` | Upload bus branding photo. |
| `/api/branding/files` | GET | `branding.documents.view` | Signed URL for a `branding-docs` object. |
| `/api/branding/nota` | POST | `branding.documents.manage` | Create Nota Dinas (auto number; reference-letter fields stored in `body` jsonb). |
| `/api/branding/nota/[id]` | POST | `branding.documents.manage` | Update nota (blocked when FINAL), finalize. |
| `/api/branding/nota/[id]/pdf` | GET | `branding.documents.view` | Nota Dinas PDF (official format; groups rows by Reference Number). |

## Claim

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `/api/claim/claims` | POST | `claim.claim.create` | Create claim (items generated from master categories). |
| `/api/claim/claims/[id]` | POST | `claim.claim.edit` / `submit` / `verify` / `approve` / `delete` (per action) | Update items/revenues, submit, review transitions, delete. |
| `/api/claim/claims/[id]/documents` | POST | `claim.claim.edit` | Upload evidence PDF for an item. |
| `/api/claim/claims/[id]/pdf` | GET | `claim.claim.view` | Claim letter PDF from template. (Letter only — combined letter+evidence PDF is not built; see module doc.) |
| `/api/claim/claims/[id]/summary` | GET | `claim.claim.view` | Summary CSV (UTF-8 BOM, formula-injection safe). |
| `/api/claim/files` | GET | `claim.claim.view` | Signed URL for a `claim-docs` object. |
| `/api/claim/master` | POST | `claim.master.manage` | Master-data mutations (categories, requirements, types, templates). |

## Search

| Method & path | Permission | Purpose |
|---|---|---|
| `GET /api/search?q=` | any session | Permission-aware global search (fleet, bookings, nota, admin docs, claims, SPM, workspace shortcuts, users) with grouped hits + subtitles |

## Branding adjustments (negotiated totals)

| Method & path | Permission | Purpose |
|---|---|---|
| `GET /api/branding/adjustments?key=` | `branding.booking.view` | Adjustment history for one transaction group |
| `POST /api/branding/adjustments` | `branding.total.override` | Save a negotiated total (ratio recomputed server-side from current snapshots; mandatory reason; supersedes the active row) or `{action:"remove"}` to revoke |

## SPM

| Method & path | Permission | Purpose |
|---|---|---|
| `GET/POST /api/spm/rates` | `spm.view` / `spm.manage` | Violation-rate master |
| `POST /api/spm/import` | `spm.manage` | Two-sided CSV import (DISHUB / OPERATOR) |
| `GET /api/spm/findings` | `spm.view` | Reconciliation findings |
| `POST /api/spm/penalties` | `spm.manage` | Freeze a penalty determination from reconciled findings |

## Admin — module & feature access

`POST /api/admin/users/[id]/module-access` (`platform.users.manage`) saves the
full access snapshot for one account: `read_<module>` / `write_<module>` plus
one `feat_<feature_code>` field per checkbox (modules, submenus, workspace
shortcuts, and the opt-in `branding.override` GRANT). Anything not submitted
is recorded as denied.

## Database RPC used by the app

The app primarily uses PostgREST table access under RLS. Security-critical database
functions: `has_permission(text)`, `is_superadmin()`, `log_audit(...)` — see
[Database Schema](07-database-schema.md#database-functions-rpc-surface). Storage signed
URLs are minted with the service-role client after the route's permission check.
