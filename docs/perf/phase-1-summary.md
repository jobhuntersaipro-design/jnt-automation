# Phase 1 — Client Bundle Quick Wins

## Changes shipped

1. **Dynamic imports for conditional components** via `next/dynamic({ ssr: false })`:
   - `dispatchers-client.tsx` → `AddDispatcherDrawer`, `DefaultsDrawer`, `DispatcherDrawer`, `BulkDetailDownload`
   - `notification-bell.tsx` → `DownloadsPanel`
   - `employee-list.tsx` → `EmployeeDrawer`
   - `dispatcher-avatar.tsx` → `AvatarEditDialog` (also made conditionally rendered — dialog was previously always mounted with `open` prop, now only mounts when the user clicks)
2. **Polling collapse** — `useJustFinishedCount` hook was re-rendering subscribers every 1 s just to expire the 10 s just-finished window. Replaced with a targeted `setTimeout` per pending entry, scheduled off `bulkJobsStore.nextUnacknowledgedExpiryAt()`. Zero timers when nothing is pending (the common case).
3. **Visibility-gated upload polling** — `active-upload-list`'s 2 s status poll now skips network work when `document.visibilityState !== "visible"`. Phone / laptop tab-switching no longer incurs background fetches.
4. **`next/image` migration** — replaced the last raw `<img>` in `month-detail-client.tsx:199` (avatar preview).
5. **Charts NOT converted to dynamic** — they render unconditionally on the dashboard, so `next/dynamic` from a server component gives marginal benefit. Proper split is a Phase 2 Suspense task.
6. **Manual `React.memo` NOT added** — the project has `reactCompiler: true` and `babel-plugin-react-compiler@1.0.0` installed, with zero `"use no memo"` escape hatches. The compiler auto-memoizes every component. Manual memo would be redundant. The audit's "no React.memo" finding was technically correct but the compiler satisfies the intent.

## Measured impact — per-route initial JS

Sum of client chunks in each route's `page_client-reference-manifest.js` (gzipped). This is the JS the browser pays for on a cold page load *before* any dynamic-import chunk loads.

| Route | Phase 0 (KB gz) | Phase 1 (KB gz) | Delta | % |
|---|---:|---:|---:|---:|
| `/auth/login` | 34.4 | 34.4 | 0 | 0% |
| `/auth/register` | 35.0 | 35.0 | 0 | 0% |
| `/(dashboard)/dashboard` | 219.0 | 217.3 | −1.7 | −0.8% |
| **`/(dashboard)/dispatchers`** | **197.0** | **69.2** | **−127.8** | **−64.9%** |
| `/(dashboard)/staff` | 57.4 | 54.1 | −3.3 | −5.7% |
| `/(dashboard)/payroll` | 42.3 | 40.5 | −1.8 | −4.3% |
| `/(dashboard)/settings` | 48.6 | 46.8 | −1.8 | −3.7% |
| `/(dashboard)/admin` | 49.8 | 48.0 | −1.8 | −3.6% |

**Dispatchers page alone drops 128 KB gzipped** — the largest single route win in the spec. That's ~256 KB of unminified JS (~3× unminified) shifted off the initial bundle into deferred chunks that only load when a user opens a drawer.

The 1–2 KB drops on every other dashboard route come from the shared layout chunk no longer pulling in `NotificationBell → DownloadsPanel`.

## Spec target progress

Spec goal: **first-load JS on `/dashboard` drops ≥ 30%**. At 217.3 KB gzipped, dashboard has NOT hit that threshold yet — charts are the remaining bulk, and splitting them is planned for Phase 2 via per-chart `<Suspense>` boundaries.

But `/dispatchers` (also a 250 KB gzipped target per the spec) is already **well under** at 69.2 KB.

## Totals (for completeness)

Aggregate `.next/static/chunks/` — this metric slightly increased because dynamic imports add chunk-split overhead, but it's not a user-visible metric (no single route loads all chunks):

| | Files | Raw (KB) | Gzipped (KB) |
|---|---:|---:|---:|
| Phase 0 | 31 | 2164.1 | 637.5 |
| Phase 1 | 39 | 2173.0 | 648.1 |

## Files modified

- `src/components/dispatchers/dispatchers-client.tsx`
- `src/components/dashboard/notification-bell.tsx`
- `src/components/dashboard/bulk-jobs-indicator.tsx`
- `src/components/payroll/active-upload-list.tsx`
- `src/components/staff/dispatcher-avatar.tsx`
- `src/components/staff/employee-list.tsx`
- `src/components/staff/month-detail-client.tsx`

Also added: `scripts/capture-route-bundle.ts`, `docs/perf/baseline/route-bundles.md`, `docs/perf/baseline/route-bundles-phase0-snapshot.md`.

## Next: Phase 2

- Drop `force-dynamic` on `/dashboard` so the 5-min `unstable_cache` works
- Split dashboard charts into individual `<Suspense>` boundaries (addresses the remaining 217 KB)
- Add composite indexes (`Branch(agentId, code)`, `Dispatcher(agentId, branchId)`, `Notification(agentId, isRead, createdAt)`)
- Paginate `/dispatchers`
- Slim `getDispatchers` includes
