# Web Performance Optimization Spec

## Goal

The app loads very slowly. This spec captures the concrete bottlenecks found in a full audit of the Next.js 16 / Prisma 7 / Neon app, prioritised by **user-visible impact vs. implementation effort**. Work is grouped into 4 phases so each phase can ship independently and be measured.

**Target metrics** (measured on Lighthouse mobile throttled, 3G Fast):

| Metric | Today (estimate) | Target |
|---|---|---|
| LCP (dashboard) | ~5–6s | < 2.5s |
| TTI (dispatchers page) | ~6–8s | < 4s |
| JS transferred on `/dashboard` | unknown — **measure first** | < 250KB gzipped |
| P95 API latency `/api/overview/export/pdf` | ~300–500ms | < 150ms OR async job |
| P95 API latency `/api/payroll/upload/[id]/payslips` | ~10s+ (blocking) | < 500ms (move to bulk-job pattern) |

---

## Phase 0 — Measure baseline (must happen before any fix ships)

Without a baseline every optimisation is guesswork. Do this first.

1. **Lighthouse CI** — add `npm run perf` script that runs Lighthouse against a local prod build (`next build && next start`) for `/dashboard`, `/dispatchers`, `/staff`, `/dispatchers/payroll/<uploadId>`. Output JSON + HTML to `docs/perf/baseline/`.
2. **Bundle analyzer** — add `@next/bundle-analyzer`, wire `ANALYZE=true npm run build` → HTML report to `docs/perf/bundle/`. Capture baseline. Flag routes > 250KB first-load JS.
3. **Server timing** — emit `Server-Timing` headers from key server-component pages and API routes (overview queries, dispatchers page, payroll pdf). Record numbers in `docs/perf/server-timing-baseline.md`.
4. **Neon slow query log** — run `mcp__neon__list_slow_queries` against dev branch and save output. Re-check after phase 2 indexes ship.

Deliverable: `docs/perf/baseline/` committed so we can compare.

---

## Phase 1 — Client bundle quick wins (1–2 days, HIGH impact / LOW effort)

Audit found **67 "use client" components, zero `next/dynamic` usage, no `React.memo`**. These fixes are mechanical and safe.

### 1.1 Lazy-load heavy dialogs, drawers, and charts
All of the following are statically imported even when the user never opens them. Convert to `next/dynamic` with `{ ssr: false }` where interactive, loading skeleton where visual:

- `src/components/staff/dispatcher-drawer.tsx`
- `src/components/staff/employee-drawer.tsx`
- `src/components/staff/add-dispatcher-drawer.tsx`
- `src/components/staff/defaults-drawer.tsx`
- `src/components/staff/avatar-edit-dialog.tsx`
- `src/components/dispatchers/bulk-detail-download.tsx` (modal — heavy)
- `src/components/dashboard/downloads-panel.tsx` (only rendered when bell opens)
- `src/components/dashboard/{monthly-net-payout-trend,salary-breakdown,branch-distribution,bonus-tier-hit-rate}.tsx` (Recharts is ~90KB gzipped — split these 4 into one shared dynamic chunk)

### 1.2 Memoize hot table rows
List/table re-renders are the biggest cause of janky editing. Wrap with `React.memo` + stable-reference props:

- `src/components/staff/dispatcher-row.tsx` (840 lines, 20+ per page)
- `src/components/payroll/salary-table.tsx` row component
- `src/components/staff/payroll-tab.tsx` employee row (882 lines of table — extract row into its own memoized component)
- `src/components/admin/admin-client.tsx` agent row

Pair with `useCallback` for any edit handlers passed in, and `useMemo` for derived row data.

### 1.3 Collapse polling timers
Three independent intervals run concurrently: `BulkJobsIndicator` (1s render tick + 3s poll), `ActiveUploadList` (2s poll), `ProcessingCard` (1s animation tick). Consolidate:

- Drop the 1s render tick in `BulkJobsStore` — use transition-based re-renders only when data changes.
- Drop the 1s animation tick in `processing-card.tsx` — use pure CSS animation for the spinner.
- Keep the 2s upload status poll but stop polling when `document.visibilityState !== "visible"` (BulkJobsStore already has this pattern, copy it).

### 1.4 Replace remaining raw `<img>` tags with `next/image`
- `src/components/settings/settings-client.tsx:346` (avatar preview)
- `src/app/(dashboard)/staff/[id]/month-detail-client.tsx:199` (avatar)

### 1.5 Remove unused dependency
`@upstash/*` shows up in `package.json` but the client audit found **zero imports in `src/`**. Confirm via `grep -r "@upstash" src/` → if empty, remove to trim install surface. (Rate limiting uses a different path — verify first.)

**Exit criteria for Phase 1:** first-load JS on `/dashboard` drops ≥ 30%, verified in bundle analyzer.

---

## Phase 2 — Database & query fixes (1–2 days, HIGH impact / LOW effort)

### 2.1 Add missing composite indexes
Every overview query joins `SalaryRecord → Dispatcher → Branch` and filters by `branch.code`. There is no index that supports this path. Add to `prisma/schema.prisma`:

- `Branch`: `@@index([agentId, code])` (covers branch lookup by code within tenant)
- `Dispatcher`: `@@index([agentId, branchId])` (covers staff/dispatchers page filter)
- `SalaryRecord`: `@@index([dispatcherId, month, year])` already exists — confirm it is actually being used via `EXPLAIN ANALYZE` on `getMonthlyPayoutTrend`.
- `Notification`: replace `@@index([agentId, createdAt])` with `@@index([agentId, isRead, createdAt])` to cover the unread-bell query.

**Migration:** `prisma migrate dev --name perf_indexes`. Neon will build concurrently; no lock expected on these table sizes.

### 2.2 Fix `force-dynamic` on `/dashboard`
`src/app/(dashboard)/dashboard/page.tsx:15` sets `export const dynamic = "force-dynamic"`. This bypasses the 5-min `unstable_cache` wrapped around the overview queries. Remove `force-dynamic` and rely on the cache (it's already keyed by `agentId` + filters). If the cache is stale for sensitive updates, use `revalidateTag` instead of bypassing cache entirely.

### 2.3 Stream the dashboard with Suspense
Today the dashboard blocks on all 6 queries before any byte is sent. Split:

- Summary cards (`getSummaryStats`) render first (fastest query) — no Suspense.
- Each chart wrapped in its own `<Suspense fallback={<Skeleton />}>` boundary with its query colocated. Slow queries no longer block fast ones.

### 2.4 Paginate `/dispatchers`
`getDispatchers()` loads **all dispatchers with every relation** (`assignments`, `weightTiers`, `bonusTiers`, `petrolRule`, `salaryRecords`). At ~500 dispatchers this is a multi-hundred-KB HTML payload. Add server-side pagination (50/page is fine; client-side filtering stays for the visible page).

### 2.5 Slim `getDispatchers` include
`salaryRecords: { select: { month, year }, take: 1 }` fetches a whole row to compute "first seen". Replace with `_count` or a precomputed `firstSeenAt` column on `Dispatcher` (set on create, cheap migration).

---

## Phase 3 — Blocking endpoints → async jobs (2–3 days, HIGH impact / MEDIUM effort)

These endpoints tie up a Node worker for seconds while rendering PDFs inline.

### 3.1 Move bulk payslip generation to the bulk-job system
`src/app/api/payroll/upload/[uploadId]/payslips/route.ts` renders up to 50 PDFs in one request (`Promise.all` × `@react-pdf/renderer.renderToBuffer`) — ~10s+ response time, risk of Vercel function timeout.

The app already has the right primitive: `src/lib/staff/bulk-job.ts` + `bulk-export-worker.ts` (used for dispatcher month-detail bulk export). Reuse it:

1. POST `/payslips` creates a job, returns `{ jobId }` instantly.
2. Worker generates PDFs with bounded concurrency (start with 3), uploads the zip to R2.
3. Downloads Center UI (existing bell panel) shows progress + download link — zero new UI needed.

Same change for `src/app/api/employee-payroll/[month]/[year]/payslips/route.ts`.

### 3.2 Cache generated overview PDFs
`/api/overview/export/pdf` regenerates the same PDF every time the user clicks Download. Since the underlying data is already cached for 5 min, cache the rendered buffer in Redis (keyed on `agentId + filters + type`) with the same TTL. A repeat click is instant.

### 3.3 Raise bulk export concurrency
`bulk-export-worker.ts` uses `concurrency = 3` for PDF. Vercel Node runtime comfortably handles 6–8. Bench first (measure memory during a 100-person export), then raise.

---

## Phase 4 — Asset & network hygiene (1 day, MEDIUM impact / LOW effort)

### 4.1 Avatars via `next/image` + R2 image transforms
User-uploaded avatars served from R2 at original resolution. Either:
- Use Cloudflare Image Resizing in front of R2 to serve 48px/96px variants, **or**
- Proxy through `next/image`'s built-in loader (works even for remote images — add R2 domain to `next.config.js` `images.remotePatterns`).

### 4.2 Add `Cache-Control` headers to GET endpoints that serve derived data
- `/api/staff/[id]/avatar/default/*` — static fallback, `public, max-age=31536000, immutable`
- `/api/staff/[id]/export/csv` — `private, max-age=60`
- `/api/overview/export/csv` — `private, max-age=60`

### 4.3 Proactive prefetch of critical routes
The nav component renders 3 top-level links. Add `<Link prefetch>` (default on) to make post-login nav feel instant. Confirm no accidental `prefetch={false}`.

---

## Out of scope (intentionally)

- **Rewriting Recharts → lighter chart lib.** Recharts is heavy (~90KB) but replacing it touches 6 components and all the interaction logic. Defer until we prove lazy-loading doesn't solve it.
- **RSC migration of admin-client / settings-client / payroll-tab.** These are the three 600–900-line client components. They need redesigning (server components + islands), not just optimising. Plan separately after Phase 1–3 ship.
- **Service worker / offline.** Not a speed issue today.
- **Edge runtime migration.** Prisma 7 driver-adapter supports edge but the payoff is marginal compared to the fixes above.

---

## Rollout plan

| Phase | Est. effort | Impact | Owner | Measured by |
|---|---|---|---|---|
| 0 — Baseline | 0.5 day | — | Any | Commit `docs/perf/baseline/` |
| 1 — Client bundle | 1–2 days | HIGH | Frontend | Bundle analyzer diff, Lighthouse delta |
| 2 — DB & queries | 1–2 days | HIGH | Backend | Neon slow-query-log delta, P95 page TTFB |
| 3 — Async jobs | 2–3 days | HIGH | Backend | P95 API latency `/payslips`, `/export/pdf` |
| 4 — Asset hygiene | 1 day | MEDIUM | Frontend | Lighthouse asset/cache audit |

Ship phases 0 → 1 → 2 sequentially (each includes its own measurement). Phase 3 and 4 can parallel after that.

## Success criteria (definition of done)

- Lighthouse mobile score on `/dashboard` ≥ **85** (from current ~62 estimated).
- First-load JS on `/dashboard` and `/dispatchers` ≤ **250KB gzipped**.
- `/api/payroll/upload/[id]/payslips` response < **500ms** (job queued, not rendered).
- P95 dashboard server TTFB < **400ms** on warm cache, < **1.5s** cold.
- No UI regression in playwright smoke suite (`npm run test:e2e`).

## References

- Audit sources: parallel `Explore` agents run 2026-04-23. Full findings archived inline in the PR description of the first implementation commit.
- Related prior work: `context/features/dashboard-migrate-end-spec.md` (added the `unstable_cache` layer), `context/features/sheets-removal-downloads-center-drawer-spec.md` (established the bulk-job pattern reused in Phase 3.1).
