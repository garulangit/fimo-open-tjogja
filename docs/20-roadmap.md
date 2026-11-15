# 20 — Roadmap

## Done (staging, verified)

- [x] Platform foundation: auth, RBAC, RLS, audit (0.1.0)
- [x] Branding module incl. pricing engine, documents, letters (0.2.0)
- [x] Claim module incl. workflow, evidence, letter PDF, reports (0.3.0)
- [x] Polish: official logo, login mascots, splash, delete confirmations,
      collapsible sidebar, Photo Stamp embed (0.4.0)
- [x] ETL: Claim master + examples; Branding full load reconciled to the rupiah
- [x] UI/UX revision 1.0.1: sidebar/header rework, Reference Numbers, multi-bus
      bookings, two-level claim validation, summary CSV
- [x] Nota Dinas in the official example format
- [x] Dashboard redesign (Tabler-adapted) + animation/compactness polish
- [x] **Production go-live** (9 Nov 2026) on `fimo.example.com`, incl. mobile
      layout package and the monthlyRevenue type-coercion fix
- [x] **FIMO rebrand + primary domain** (10 Nov 2026): `fimo.example.com`
      (Worker `fimo-prod`); OMS-branded address kept running on the same data
- [x] **Mobile app shell**: Home page, 5-tab bottom bar with tile sheets, swipe
      drawer, installable PWA
- [x] **Workspace launchers** (Application Hub & Work Drive, static catalog)
- [x] **Denda SPM simulation prototype** shipped in the build (superadmin demo)
- [x] **Repository consolidation**: v2 adopted as `main`; FIMO production build
      merged into `main` via PR #1 after a full-tree zero-loss verification —
      `main` is the single source of truth again
- [x] **Automatic backups** for both Supabase projects (verified zips,
      restore-tested, scheduled)
- [x] **Access matrix Fase 1** (migration 0008): per-account module Read/Write
      checkboxes; roles demoted to presets
- [x] **AI agent DB contract** (migration 0009): `agent_*` views + read-only
      roles for the self-hosted AI agent
- [x] **SPM backend** (migration 0010): real persistence + `/api/spm/*`
- [x] **Storage self-hosted** (migration 0011): MinIO backend live on staging
- [x] **Per-submenu checkboxes** (migration 0012), redesigned matrix UI,
      hidden-by-default navigation, User Management moved into Setting
- [x] **Global search + suggestions + bus spotlight**, per-module filters,
      dedicated fleet-number search in Branding
- [x] **Negotiated total override** (migration 0013): ratio-locked ledger,
      opt-in GRANT checkbox, two-step confirmation popup, audit trail
- [x] **Per-shortcut Workspace checkboxes** (Application Hub & Work Drive)
- [x] **v1.1.1 stable released to production** (11 Nov 2026): migrations
      0008–0013 + Worker `fimo-prod` from `main`

## Next (in owner priority order)

1. **Claim combined PDF** — merge claim letter + all evidence attachments into one
   PDF (last legacy-parity gap). Status: PLANNED.
2. **Denda SPM — real module**: schema + RLS + permissions + persistent CSV
   import + two-sided reconciliation + Berita Acara PDF. BLOCKED on owner
   inputs: official tariff document, a sample Dishub CSV, and the exact
   "gagal SO" definition. The simulation prototype is already in the build.
3. **Storage buckets as a migration** (0008): buckets were created manually;
   codify them so a fresh project provisions identically.

## Parked / awaiting owner input

- **LEFT_BODY / RIGHT_BODY** single-side placements (needs a modelling decision).
- **Route detail texts** for Nota Dinas attachments beyond route 5B (needs the
  official route lists).
- **Arial Narrow embedding** for pixel-faithful Nota Dinas PDFs (needs a dependency
  decision: `@pdf-lib/fontkit` + font files).
- Fate of the legacy applications after cutover, and of the OMS-branded
  production address now that FIMO is primary.
- Cloudflare login rate-limit rule (needs dashboard action by the owner or a
  token with WAF scope; app-level mitigation is a possible alternative).
- Three binary files (app icon + two letter-template DOCX) still live outside
  `main`'s history (text-only push path); move them in via a binary-capable
  route when convenient.
