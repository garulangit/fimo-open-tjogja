# 01 — Overview

## Purpose

FIMO — Fleet Integrated Management & Operations (formerly FIMO) — replaces
two separate legacy administration tools with **one application and one database**:

| Legacy system | Source stack | OMS module |
|---|---|---|
| `dashboard-branding-legacy` (v2.0) | Firebase/Firestore + Supabase Storage (public bucket) | [Branding](03-module-branding.md) |
| `subsiditrack` | Next.js + Prisma + SQLite | [Claim](04-module-claim.md) |

Scope is **administration only**: bookings of advertising space on buses, operational
subsidy claims, supporting documents, and reports. Fleet telematics/GPS (the vendor FMS)
is explicitly out of scope.

## Objectives

1. One login, one permission model, one audit trail for all administration modules.
2. Close the legacy security gaps (unauthenticated APIs, IDOR between claims, public
   file buckets, free-form status transitions) with centralized authorization and
   database-enforced rules (RLS, triggers, guards).
3. Preserve legacy business logic faithfully: pricing tiers, duration rules, subsidy
   calculation, document formats (Nota Dinas, Surat Penawaran, Surat Konfirmasi, claim
   letters) are ports of the legacy behaviour, verified against legacy data to the
   rupiah after ETL.
4. Run entirely on free tiers (Cloudflare Workers Free, Supabase Free) until the owner
   decides otherwise.

## Module status matrix

| Module | Code | Status | Notes |
|---|---|---|---|
| Platform foundation (auth, users, audit) | — | **IMPLEMENTED** | SQL tests 17/17, E2E 25/25 |
| Branding FIMO | `branding` | **IMPLEMENTED** | SQL tests 16/16 + 5/5 (exclusivity) + 0005 checks, E2E 27/27 |
| Klaim Subsidi (Claim) | `claim` | **PARTIAL** | Core workflow complete (E2E 22/22); combined claim letter + evidence PDF not yet built — see [Claim](04-module-claim.md#known-limitations) |
| Photo Stamp | `photo_stamp` | **IMPLEMENTED** | Vendored static FIMO-Stamp V2 app embedded in the OMS shell |
| Workspace (Application Hub & Work Drive) | — | **IMPLEMENTED** | Static catalog in code (not yet DB-driven), superadmin-gated — see [Workspace](22-workspace-modules.md) |
| Denda SPM | `spm` | **OPERATIONAL** | Real backend since 11 Nov 2026 (migration 0010): rate master, two-sided CSV import, reconciliation, frozen penalty determinations. Seeded tariffs still await official verification — see [SPM](06-module-spm.md) |
| Mobile shell & PWA | — | **IMPLEMENTED** | Home page (`/home`), 5-tab bottom bar with tile sheets, swipe drawer, installable PWA (manifest + service worker) |

## Environments

Development happens against **staging** (Supabase `oms-storage`, Worker `oms-staging`).
Production is **live**: first go-live 9 Nov 2026 on `fimo.example.com`
(Worker `oms-prod`), then rebranded to **FIMO** on 10 Nov 2026 with the primary
domain moved to `fimo.example.com` (Worker `fimo-prod`). Both production
Workers share the same `oms-prod` database; the OMS-branded address keeps
running the pre-rebrand build. New production deploys remain gated on explicit
owner approval — see [Roadmap](20-roadmap.md).

## Who uses it

Two roles only, by design:

- **superadmin** — full access (28 permissions), manages users and master data.
- **admin** — operational staff (22 permissions); cannot manage users, roles, or
  platform settings.

Accounts are created by a superadmin inside the app. Public sign-up is disabled.
See [Auth, RBAC & RLS](08-auth-rbac-rls.md).
