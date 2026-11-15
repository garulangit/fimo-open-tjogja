# 11 — Design System & UI Components

## Foundations

- **Vanilla CSS** in `app/globals.css`, driven by CSS variables: `--bg`, `--surface`,
  `--surface-2`, `--border`, `--text`, `--muted`, `--primary` (`#177245`), `--accent`
  (`#0e9594`), plus `--ok-*`, `--warn-*`, `--danger` semantic pairs. Dark mode is
  `[data-theme="dark"]` variable overrides; the header toggle is an animated sun/moon
  icon. Brand green derives from the official FIMO logo (`#0F4933`, with
  `#FDC421`/`#FFBE22` yellows in the logo itself).
- Typography and motion language follow the project's "Arka Nararya" standard: large
  confident headings, staggered pop-in (`pop` keyframes with per-card `delay`),
  count-up numbers, shine sweeps, floating background orbs — all disabled under
  `prefers-reduced-motion`.
- Official logo: `components/Logo.tsx` (`LogoFull`/`LogoIcon`) renders the official
  SVG (green adapts to white on dark). Source of truth: `prep/logo-official/logo-ori.svg`;
  favicon is `app/icon.svg` (+ `app/apple-icon.png`).

## Shell

- **Sidebar** (from `module_registry` + permissions): sections *Dashboard*, *Modul*
  (collapsible groups per module; the active route's group is always open; state in
  `localStorage`), *Manajemen User*, *Setting* (only entries backed by real functions:
  Pricelist & Tarif, Data Bus, Master Data Klaim). PhotoStamp is a direct link;
  Denda SPM sits last with a "Segera" badge.
- **Header**: app title left; theme toggle and account dropdown right (Ganti Password,
  Keluar). No account block in the sidebar.
- **Footer watermark** on every page (`components/AppFooter.tsx`): `© 2026 All rights
  reserved. / Developed with 💘 by Andhika Febri / OMS Angkutan Perkotaan v.<version>`.
- **Login**: mascots ported from legacy branding v2.0 (`components/LoginMascots.tsx`)
  react to typing/focus/password visibility; a short splash (`components/Splash.tsx`)
  follows a successful sign-in.

## Shared components (`components/`)

| Component | Role |
|---|---|
| `Logo.tsx` | Official logo (full + icon variants). |
| `NavLinks.tsx` | Sidebar navigation from registry + permissions. |
| `AccountMenu.tsx` | Header account dropdown. |
| `ThemeToggle.tsx` | Dark/light toggle. |
| `AppFooter.tsx` | Watermark footer. |
| `ConfirmDelete.tsx` | Delete confirmation modal (React portal to `document.body`, Escape to close — always viewport-centred). |
| `BusPicker.tsx` | Searchable multi-select bus picker for bookings. |
| `ClaimSummaryDownload.tsx` | One-shot auto-download of the claim summary CSV after create/submit (strips the `summary=1` marker from the URL). |
| `LoginMascots.tsx`, `Splash.tsx` | Login mascots and post-login splash. |
| `CountUp.tsx` | Generic count-up number (standalone pages). |

## Dashboard kit (`components/dashboard/`)

Design patterns adapted from **Tabler** (MIT License; grid-of-12 layout, KPI cards,
chart cards, donut + legend, activity tables) and from the **legacy Branding v2.0
dashboard** (compact horizontal KPI cards with coloured icon chips, animated charts
with cubic ease-out ≈ 820 ms, gridlines + axis labels) — re-implemented natively in
React + SVG, no library code or assets copied.

| Export | Role |
|---|---|
| `DashCard` | Chart/table card with title, subtitle, optional action, grid span 4/6/8/12. |
| `KpiCard` | Compact KPI: tone-coloured icon chip, count-up value (`num` + `numFormat`: `int`/`pct`/`rp`/`rpCompact`), note, optional sparkline. Tones: green, blue, amber, violet, teal, red, slate. |
| `BarChart` | SVG bars: gradient fills, rounded tops, grow animation (staggered), y-gridlines + tick labels, per-bar value labels, multi-series legend. |
| `Donut` | SVG donut with sweep animation, centre value, legend with counts and %. |
| `Sparkline` | Animated line + area (draw-on via dashoffset). |
| `CountUp` | rAF count-up (820 ms cubic ease-out; instant under reduced motion). |

Dashboards are **server components** fed exclusively by real queries; empty states
render explicit notes instead of placeholder data. Financial figures from Branding
(bookings) and Claim (subsidy) are always presented separately, never summed.

## Responsiveness

The dashboard grid is 12 columns ≥ 900 px, 2-up between 640–899 px, single column
below 640 px; sparklines hide below 720 px. Tables keep horizontal scroll containers.
