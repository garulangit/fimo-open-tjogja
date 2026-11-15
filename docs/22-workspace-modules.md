# 22 — Workspace Modules

**Status: IMPLEMENTED** — live in the production build since 10 Nov 2026.
Access is governed by the per-account matrix (module `workspace` + the
Application Hub / Work Drive features), and since 11 Nov 2026 **every
shortcut has its own checkbox** (`workspace.app.<icon>`,
`workspace.drive.<slug>`): an account only sees the shortcuts granted to it,
in the catalog pages and in global search alike. The catalog is static data
in code (`components/workspace/catalog.ts`); the originally planned
DB-driven `app_links` master with in-app editing has **not** been built yet —
changing a link currently requires a code change and a deploy (but adding a
catalog entry automatically adds its matrix checkbox).

## Application Hub

`/workspace/applications` is an authenticated launcher backed by the centralized
catalog in `components/workspace/catalog.ts`. It supports name search and category
filtering. Application tiles show a large centered icon, name, and concise
description; the whole tile opens its destination in a new tab with
`noopener noreferrer`. Ticketing, GPS, CCTV, mail, and ERP use Lucide icons;
FMS, EasyGo, and Cekat use their catalog image URLs with a Lucide fallback if an
image fails. The supplied cPanel URL contained a session-specific
`cpsess` token; the catalog links to the cPanel host root instead. FMS uses the URL
given in the owner brief. This catalog does not store credentials or inspect external
login sessions.

## Work Drive

`/workspace/drive` reads the same centralized catalog and provides title search,
category and file-type filters. Only destinations explicitly provided in the latest
brief are included. Daily Operations is omitted because its destination is unknown.
The template folder URL follows the latest brief; the earlier brief provided a
different folder ID and requires owner confirmation before correction.

## Denda SPM

Expandable sidebar group directly below PhotoStamp with child links to `/spm`
(Overview), `/spm/reconciliation`, `/spm/penalties`, and `/spm/rates`. Since
migration 0010 the module is backed by real tables and `/api/spm/*` — see
[Module: Denda SPM](06-module-spm.md) for the current state. The seeded rate
master (53 rows) remains unverified against the official tariff document.

## Access

All pages require an authenticated FIMO session. Workspace visibility is
resolved per account: module Read (matrix) → group feature
(`workspace.applications` / `workspace.drive`) → per-shortcut feature.
SPM routes use their own permissions (`spm.view` / `spm.manage`) plus
per-submenu feature guards. Navigation renders nothing an account cannot
open. See [Auth, RBAC & RLS](08-auth-rbac-rls.md).
