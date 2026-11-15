# 05 — Module: Photo Stamp (`photo_stamp`)

**Status: IMPLEMENTED** (as an embedded tool; not a native OMS module)

## Purpose

Field documentation photos stamped with date/time/location metadata (the FIMO-Stamp
tool of the FIMO ecosystem), used as supporting evidence in operations.

## How it is implemented

Photo Stamp is **not** re-implemented in Next.js. The complete static FIMO-Stamp V2
web application is vendored under `public/fimo-stamp-app/` (plain HTML/CSS/JS with
bundled vendor libraries: EXIF reader, JSZip, PapaParse) and embedded into the OMS
shell at `/photo-stamp` via an iframe, so the sidebar and header remain visible —
an owner requirement. A "fullscreen" affordance is available for wide work.

- No OMS database tables, no API routes, no file uploads to Supabase: processing is
  **client-side only** (batch stamping, CSV-driven metadata, PDF/ZIP export happen in
  the browser).
- Access is gated by the authenticated OMS shell (middleware + module registry);
  the module is listed in the sidebar as a direct link (no submenu).
- The vendored copy is a snapshot of FIMO-Stamp V2 (from the `fimo-platform`
  project). Upstream changes are **not** automatically synced; updating the module
  means replacing the snapshot deliberately.

## Authorization

Visible to signed-in users whose role includes module access via the registry;
there are no module-specific permissions or server-side data.

## Known limitations

- Anything the tool produces stays on the user's device; OMS does not store or audit
  stamped photos.
- Because it is a vendored snapshot, bug fixes made in the FIMO-Stamp project do not
  flow here automatically.
