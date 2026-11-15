# 19 — Architecture Decisions (ADR)

Condensed log of decisions that shaped this codebase, with their rationale. Dates are
owner-decision dates.

| # | Decision | Rationale / consequences |
|---|---|---|
| ADR-01 | Build a **new** OMS (this repo) instead of adopting the earlier `fimo-oms-production` prototype | The prototype (built by a third-party generator) was never verified. Legacy apps serve as the behavioural benchmark instead. (2026-11-07) |
| ADR-02 | **One app, one Supabase database** for Branding + Claim (+ future SPM) | Shared auth, permissions, audit; no cross-service joins. Two projects exist only to separate staging/production. |
| ADR-03 | Hosting on **Cloudflare Workers via OpenNext** (after a spike vs. alternatives; see `SPIKE-RESULTS.md`) | Free tier, edge PDF generation proven < 1 ms, `nodejs_compat` covers the used Node APIs. Runtime is `workerd`, not Node — Node >= 24 is build-time only. |
| ADR-04 | **Username + password** auth mapped to internal emails; public sign-up off; two roles with granular permissions | Matches office practice (no corporate email per staff); authorization stays independent of the identity provider. |
| ADR-05 | Authorization centralized in **`has_permission()`**, enforced at UI + server + RLS | One definition of "allowed"; RLS remains correct even if a route forgets its guard. |
| ADR-06 | **Database-enforced invariants** (conflict trigger, FINAL-nota guard, claim transition guard, last-superadmin guards) | Rules that must never be violated cannot depend on every caller remembering them. |
| ADR-07 | **Snapshots** for booking prices and claim submissions | Historical documents must not change when master data changes. |
| ADR-08 | **Private storage buckets + signed URLs** (legacy used a public bucket) | Closes direct-link exposure of contracts and financial evidence. |
| ADR-09 | Booking exclusivity **per bus per period regardless of placement** (migration 0004), retiring the legacy Side/Back zone coexistence | Owner decision after reviewing real operations; simpler and safer. |
| ADR-10 | Claim validation is **two-level**: hard blockers vs document-completeness warnings (audited) | Matches real workflow — paperwork often completes after submission; the audit keeps it honest. (1.0.1) |
| ADR-11 | Multi-bus booking submissions share **one Reference Number** (migration 0005) | Documents, Nota Dinas, letters and reports all key off the reference. |
| ADR-12 | **Vanilla CSS + hand-rolled SVG charts; no CSS/chart frameworks** | Keeps the bundle and dependency surface minimal; dashboard patterns adapted from Tabler (MIT) and the legacy dashboard. |
| ADR-13 | Photo Stamp **vendored and iframed**, not reimplemented | The tool is self-contained and client-side; embedding preserves the OMS shell (owner requirement) at zero backend cost. |
| ADR-14 | Nota Dinas PDF reproduces the **official Word example** format | The document is a legal-administrative artifact; fidelity to the approved example outranks the earlier simplified design. Font embedding deferred (needs a new dependency decision). |
| ADR-15 | Production stays on **Supabase Free** at go-live decision time; paid upgrade and keep-alive are gated pre-launch choices | Cost discipline; the risks (auto-pause, no daily backups) are documented rather than hidden. |
| ADR-16 | SPM module **registered but inactive**, last in the sidebar | Keeps the roadmap visible without implying functionality that does not exist. |
