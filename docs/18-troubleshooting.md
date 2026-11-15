# 18 — Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Login succeeds but dashboards show no module sections | The account has no role in `user_roles`, or the profile is deactivated — `has_permission()` returns false everywhere | Assign a role (superadmin UI or SQL); check `profiles.is_active`. This is authorization working as intended. |
| Every API returns 401 | Session cookie missing/expired; middleware is doing its job | Sign in again; check the browser keeps cookies for the staging domain. |
| New account cannot sign in after creation | `must_change_password` flow or wrong internal email mapping | Accounts sign in with the **username**; the app maps it to `<username>@oms.internal`. |
| Booking rejected although the bus "looks free" | An overlapping **active** booking exists (BOOKING/PROSES/effective BERJALAN) — rule is placement-independent since migration 0004 | Check the bus's bookings overlapping the period, including ones whose stored status has not been advanced. |
| Multi-bus submission fails entirely | One selected bus conflicts → whole submission rejected by design | Remove the conflicting bus and resubmit; nothing was half-saved. |
| Nota Dinas cannot be edited | It is `FINAL` (immutable by trigger) | Create a new nota; FINAL documents are never edited. |
| Claim submit blocked | A **blocking** validation fails (identity/period/negative/no items). Missing documents never block | Read the "Syarat Wajib" panel; completeness notes are warnings only. |
| PDF looks different from the official Nota Dinas example | Known deltas: Helvetica vs Arial Narrow; route detail only for 5B; single Left/Right placement not modelled | See [Module: Branding — Known limitations](03-module-branding.md#known-limitations). |
| Local `next start`/dev cannot reach Supabase from a sandboxed VM | Egress proxy restrictions of the sandbox, not an app bug | Verify against the deployed staging Worker instead; the Worker reaches Supabase normally. |
| Wrangler deploy fails on auth | `CLOUDFLARE_API_TOKEN` missing/expired | Re-issue the token from the workspace vault; never hard-code it. |
| Worker returns stale UI after deploy | Browser cache or an old Worker version still propagating | Confirm the deployed Version ID; hard-refresh. |
| Supabase staging project unreachable after idle days | Free-tier auto-pause | Resume the project from the Supabase dashboard; for production this risk is a go-live decision item (see [Deployment](16-deployment.md)). |

## Getting diagnostics

- Worker version: `wrangler deployments list` / the deploy output's Version ID.
- Audit trail: query `audit_events` (or the Claim overview's activity card) for
  who did what, including validation notes.
- E2E suites double as smoke tests: run them against the staging URL to separate
  "app broken" from "my account/session broken".
