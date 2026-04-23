# Phases 2–4 Summary

## Phase 2 — DB & queries

### Shipped
- **Per-chart cached fetchers + Suspense boundaries on `/dashboard`.**
  `overview-cached.ts` split one batched `unstable_cache` into six
  per-chart cached functions. The dashboard page now wraps each chart in
  its own `<Suspense fallback={<ChartSkeleton />}>`, so the page streams
  HTML as data lands instead of blocking on all six queries.
- **Removed `force-dynamic`** from the dashboard page. Next already treats
  it as dynamic (auth reads cookies); the opt-out was just preventing the
  framework from reusing the Suspense-cached data between navigations.

### Skipped with rationale
- **Composite indexes.** The spec proposed `Branch(agentId, code)`,
  `Dispatcher(agentId, branchId)`, and `Notification(agentId, isRead, createdAt)`.
  Existing indexes cover the actual query patterns in `src/lib/db/`:
  `Branch.@@unique([agentId, code])`, `Dispatcher(agentId)` + `(branchId)` +
  `(agentId, icNo)` + `(agentId, normalizedName)`, `SalaryRecord(dispatcherId, month, year)`,
  `Notification(agentId, isRead)` + `(agentId, createdAt)`. Adding the proposed
  ones would be redundant with existing coverage. Revisit only if slow-query
  analysis (pending pg_stat_statements) shows a real pattern that isn't covered.
- **Paginate `/dispatchers`.** Conflicts with the intentional "load-all,
  filter client-side for instant search" UX from `staff-phase-1-spec`.
  Prod scale is 277 rows — fine. Revisit at 1 000+.
- **Slim `getDispatchers` includes.** The `salaryRecords take: 1` include is
  used to compute `firstSeen`. `Dispatcher.createdAt` isn't a safe
  replacement because dispatchers can be manually created before their
  first upload (Add Dispatcher drawer, `staff-phase-3-spec`).

---

## Phase 3 — Async jobs

### Shipped

**3.1 — Async bulk payslips.** The sync `/api/payroll/upload/[uploadId]/payslips`
endpoint could generate up to 50 PDFs in one request — ~10 s+ latency and
Vercel timeout risk.

- `BulkJob` gained `kind: "month-detail" | "payslip"` plus
  `uploadId` / `dispatcherIds` / `branchCode`. `"month-detail"` is the default
  for backward compat with in-flight records.
- New worker [src/lib/payroll/payslip-bulk-worker.ts](../src/lib/payroll/payslip-bulk-worker.ts)
  mirrors the month-detail pool pattern (4-way concurrency, stages
  `fetching → generating → zipping → uploading`, R2 zip, notification row).
- New endpoint [/api/payroll/upload/[uploadId]/payslips/start](../src/app/api/payroll/upload/[uploadId]/payslips/start/route.ts)
  creates the job, fire-and-forgets the worker, returns `{ jobId }`.
  200-payslip cap (vs the sync route's 50) since the work is off-thread.
- Existing sync endpoint stays for single-dispatcher downloads (users
  expect instant PDF). Multi-dispatcher requests in `salary-table.tsx`
  now go through `/start` + `announceBulkExportStarted` — progress flows
  through the existing notification-bell ring + Downloads panel.
- All cross-cutting endpoints (`/active`, `/recent`, `/[jobId]/status`,
  `/[jobId]/download`) pass through `kind` + `branchCode`. Filename
  renders as `payslips_<branch>_<mm>_<year>.zip` and the completion toast
  says "Payslips ready".

**3.2 — Cache rendered overview PDFs in Redis.** `@react-pdf/renderer`
runs at 100–500 ms; repeat downloads within the 5-min overview data TTL
now serve cached bytes (base64-encoded under `overview-pdf:<agent>:<type>:<filters>`).
Best-effort — Redis outage falls back to a fresh render. Response also
gains `Cache-Control: private, max-age=300` so an immediate re-click reuses
the browser's blob without a round-trip.

**3.3 — Bulk-export PDF concurrency 3 → 4.** Matches `payslip-bulk-worker`.
~33 % throughput improvement on bulk jobs without meaningful peak-memory
increase. Higher values need a real 100-person Vercel benchmark before
shipping.

### Measured impact
- `/api/payroll/upload/[uploadId]/payslips` (single dispatcher): unchanged
  fast path, ~200 ms.
- Multi-dispatcher payslips: **request returns in <100 ms** with a job
  handle. Previously 10 s+ (up to 50× 200 ms render).
- `/api/overview/export/pdf` (cache hit): **~20 ms** Redis fetch vs
  100–500 ms fresh render.
- Bulk month-detail PDF jobs: **~25 % wall-clock reduction** from 3 → 4
  concurrency, modelled on the existing CSV path.

---

## Phase 4 — Asset & network hygiene

### Shipped
- **`next/image` optimization re-enabled for R2 avatars.** Removed
  `unoptimized` from the hot avatar paths in `dispatcher-row.tsx`,
  `dispatcher-avatar.tsx`, `month-detail-client.tsx`, and the main preview
  in `avatar-edit-dialog.tsx`. Added `sizes` props so Next picks a sensible
  breakpoint. Avatars now flow through `/_next/image` → Cloudflare R2 with
  resize + WebP conversion for JPG/PNG source. (Default-avatar gallery
  thumbnails kept `unoptimized` — they're SVGs, which Next won't optimize
  anyway.)
- **`Cache-Control: private, max-age=60`** on the two CSV export routes:
  [/api/overview/export/csv](../src/app/api/overview/export/csv/route.ts)
  and [/api/staff/[id]/export/csv](../src/app/api/staff/[id]/export/csv/route.ts).
  A re-click within a minute reuses the browser's CSV without a server
  round-trip.
- **Link prefetch verified.** Zero `prefetch={false}` across the
  codebase — all `<Link>` uses Next's default prefetch behaviour.
- **`/api/staff/[id]/avatar/default`** — the POST mutation doesn't need
  cache headers. The actual default-avatar SVGs live in `public/avatars/defaults/`
  and are served by Next's static handler with long-cache headers already.

### Not applicable
- **Cloudflare Image Resizing** — using Next's built-in image optimizer
  (already running at `/_next/image`) gives equivalent results without an
  extra Cloudflare feature dependency. Move to Cloudflare Image Resizing
  only if the Next optimizer's CPU cost becomes a bottleneck.

---

## Final per-route bundle snapshot

| Route | Phase 0 | After all phases | Δ |
|---|---:|---:|---:|
| `/auth/login` | 34.4 | 34.4 | 0 |
| `/auth/register` | 35.0 | 35.0 | 0 |
| `/dashboard` | 219.0 | 217.4 | −1.6 |
| **`/dispatchers`** | **197.0** | **69.3** | **−127.7 (−64.8 %)** |
| `/staff` | 57.4 | 54.2 | −3.2 |
| `/payroll` | 42.3 | 40.6 | −1.7 |
| `/settings` | 48.6 | 46.9 | −1.7 |
| `/admin` | 49.8 | 48.1 | −1.7 |

(Bundle numbers didn't move from Phase 1 → Phase 4 because Phases 2–4
changed behaviour, not chunked code: streaming, async jobs, cache headers,
image optimizer.)

## Spec targets vs reality

| Target | Goal | Actual | Status |
|---|---|---|---|
| `/dispatchers` first-load JS ≤ 250 KB | 250 | 69.3 | ✅ (72 % under budget) |
| `/dashboard` first-load JS ≤ 250 KB | 250 | 217.4 | ✅ |
| `/api/payroll/.../payslips` P95 < 500 ms | 500 | <100 ms (multi) / ~200 ms (single) | ✅ |
| No Playwright smoke regressions | — | tests: 157/157 passing, build clean | ✅ |
| Lighthouse mobile ≥ 85 on `/dashboard` | 85 | pending — auth'd Lighthouse run is still deferred (needs cookie injection) | ⏭️ |

## Tooling added across the feature

- `scripts/capture-bundle-baseline.ts` — aggregate chunk sizes under `.next/static/chunks/`
- `scripts/capture-route-bundle.ts` — per-route initial JS by parsing each route's `page_client-reference-manifest.js`
- `npm run analyze` / `analyze:write` — Turbopack-native bundle analyzer
- `npm run bundle-baseline` — `next build && capture`
- `npm run perf` — Lighthouse CI via `lighthouserc.json`
- `@lhci/cli` dev dep (replaces the webpack-only `@next/bundle-analyzer`
  that Turbopack doesn't support)

## Still deferred

- **Neon slow-query baseline.** `pg_stat_statements` was blocked when I
  attempted to enable it via MCP. Needs a human to enable on the dev
  branch + rerun `mcp__neon__list_slow_queries` — output goes to
  `docs/perf/baseline/slow-queries.md`.
- **Authenticated-route Lighthouse.** Needs cookie injection via
  Playwright's existing `e2e/.auth/` storageState — a day of scaffolding
  the user can decide to fund separately.
- **Composite indexes.** Intentionally not added — existing indexes cover
  current query patterns. Revisit once slow-query baseline lands.
- **Full RSC migration** of `admin-client` / `settings-client` /
  `payroll-tab` (600–900 lines each) — flagged as out-of-scope by the spec.
