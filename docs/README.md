# FIMO — Documentation

Complete technical documentation for **FIMO (Fleet Integrated Management &
Operations)**, the internal administration platform of Operator A
Internasional (Operator A), Unit Transportasi FIMO, Yogyakarta. The
application was formerly named **FIMO**; it was rebranded to FIMO on
10 Nov 2026. Internal names (repository, Supabase projects `oms-prod` /
`oms-storage`) intentionally keep the OMS prefix.

The documentation describes the system **as implemented in the source code**. Every
feature is labelled `IMPLEMENTED`, `PARTIAL`, `PLANNED`, or `BLOCKED`. If a document and
the code disagree, the code (and the SQL migrations) win — please open a fix.

## Reading order

| # | Document | What it covers |
|---|----------|----------------|
| 01 | [Overview](01-overview.md) | Purpose, scope, module status matrix |
| 02 | [Architecture](02-architecture.md) | System architecture, tech stack, repository structure |
| 03 | [Module: Branding](03-module-branding.md) | Bus branding bookings, pricing, Nota Dinas, documents |
| 04 | [Module: Claim](04-module-claim.md) | Operational subsidy claims (Klaim Subsidi) |
| 05 | [Module: Photo Stamp](05-module-photo-stamp.md) | FIMO-Stamp embedded tool |
| 06 | [Module: SPM](06-module-spm.md) | Denda SPM — simulation prototype shipped (superadmin); real build pending inputs |
| 07 | [Database Schema](07-database-schema.md) | Tables, relationships, ERD, triggers, functions |
| 08 | [Auth, RBAC & RLS](08-auth-rbac-rls.md) | Authentication, permissions, row-level security, audit |
| 09 | [API & RPC Reference](09-api-reference.md) | All HTTP routes and database functions |
| 10 | [Business Workflows](10-business-workflows.md) | Booking, claim, and document lifecycles |
| 11 | [Design System](11-design-system.md) | Themes, components, dashboard patterns |
| 12 | [File Processing & Storage](12-file-storage.md) | Buckets, validation, PDF generation |
| 13 | [Environment Configuration](13-environment-config.md) | Environment variables and Worker vars |
| 14 | [Local Development](14-local-development.md) | Setup and day-to-day development |
| 15 | [Testing & QA](15-testing-qa.md) | SQL tests, E2E suites, verification gates |
| 18 | [Troubleshooting](18-troubleshooting.md) | Known failure modes and fixes |
| 19 | [Architecture Decisions](19-architecture-decisions.md) | ADR log |
| 20 | [Roadmap](20-roadmap.md) | What is done, what is next, what is parked |
| 21 | [AI Agent Guide](21-ai-agent-guide.md) | Onboarding for AI coding agents |
| 22 | [Workspace Modules](22-workspace-modules.md) | Application Hub & Work Drive launchers |

## Conventions

- Business terminology is kept in Indonesian where it is a domain term (e.g. *Nota Dinas*,
  *Klaim Subsidi*, *Denda SPM*); explanations are in English.
- Money is always stored as `numeric(20,2)` (IDR) and displayed with `formatRupiah`.
- Dates and times in business logic use the `Asia/Jakarta` timezone.
- Status labels: **IMPLEMENTED** (live in staging and covered by tests), **PARTIAL**
  (works, with a named gap), **PLANNED** (designed, not built), **BLOCKED** (waiting on
  an external decision or input).

## Environments at a glance

| Environment | App | Database | Status |
|---|---|---|---|
| Staging | Cloudflare Worker `oms-staging` (`*.workers.dev`) | Supabase project `oms-storage` (Tokyo) | Active development target |
| Production (primary, FIMO brand) | `fimo.example.com`, Worker `fimo-prod` | Supabase project `oms-prod` (Sydney) | **LIVE since 10 Nov 2026** |
| Production (legacy OMS brand) | `fimo.example.com`, Worker `oms-prod` | Supabase project `oms-prod` (Sydney) | LIVE since 9 Nov 2026; same database, pre-rebrand build |

Deployment uses the standard Wrangler/OpenNext flow.
