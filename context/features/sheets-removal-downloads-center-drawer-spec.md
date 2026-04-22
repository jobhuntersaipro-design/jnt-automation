# Spec: Sheets → PDF + Downloads Center + Dispatcher Performance Drawer

Status: Draft
Author: Claude Code
Branch target: `feature/sheets-removal-downloads-center`

## Summary

Three interrelated changes:

1. **Remove Google Sheets integration end-to-end** (schema, OAuth routes, library, UI). Wherever a "Google Sheets" / "Sync to Google Sheets" action exists today, replace with **"Download PDF"** of the equivalent dataset.
2. **Ship a Downloads Center** so users never have to guess where completed CSV / PDF / ZIP exports live — a bell-panel inbox surfaces the active ring jobs *and* the last N completed exports with a persistent **Download** button per row. (Current UX relies on a 30-second toast that is trivially missed.)
3. **Make Dispatcher Performance table rows clickable** on the Overview page — a click opens the same `DispatcherDrawer` (slide-in from the right) that `/dispatchers` uses, showing salary history for that dispatcher.

The three ship together because they all touch the export / notification surface and removing Sheets frees the surface area to cleanly land the Downloads Center.

## Why

- **Sheets is unused complexity**: OAuth flow, token refresh, `googleapis` dependency, 4 API routes, 2 migrations. Every row had an extra button users rarely click; every agent has to OAuth once. PDFs are self-contained artifacts, don't need a 3rd-party account, and are already generated for payslips + bulk detail.
- **The completion toast is lossy**: users start an export, switch tabs, miss the 30 s toast, then come back and have no idea where their zip went (the jobId is only in the toast action — there's no surface that lists it). This is already a real pain point for multi-minute PDF exports.
- **Overview discoverability**: users click dispatcher names in the Staff page to see history; the same instinct on the Overview → Dispatcher Performance row does nothing today. Matching behaviour lowers the cognitive load of switching pages.

## Goals

- Zero Google Sheets code / schema / routes in the repo.
- Every spot that said "Sync/Export to Google Sheets" now says "Download PDF" and delivers a PDF with the same data the Sheets export carried.
- A **Downloads Center** in the notification bell panel:
  - Shows jobs that are in flight (progress, cancelable-later).
  - Shows the last N (default 10) completed exports with **Download** buttons that hit the existing `/api/dispatchers/month-detail/bulk/[jobId]/download` (or analogous CSV/PDF endpoints for direct downloads).
  - Survives page navigation and refresh within the TTL of the underlying job store (2 hours — matches `bulk-job.ts`).
- Dispatcher Performance table rows open the existing `DispatcherDrawer` on click.

## Non-goals

- No new export formats beyond today's **CSV** and **PDF** (plus **ZIP of PDFs** for bulk).
- No email / webhook delivery — downloads remain in-app only.
- No history beyond the 2-hour TTL. A user who lets a job expire re-generates.
- No changes to how payslips are generated (that path already returns a direct PDF response).

## User stories (spec-by-example, drives the tests)

> These map 1:1 to test cases in the "Test plan" section at the end.

- **US-1:** Agent clicks **Summary → PDF** on a Payroll History row. A PDF download begins immediately; no Google Sheets option appears anywhere in the UI.
- **US-2:** Agent triggers a Bulk Detail CSV zip, closes the success toast by accident. They click the bell → the Downloads panel shows *"CSV export ready · 2026_03_details.zip · Download"*. Clicking Download streams the zip.
- **US-3:** Agent triggers a PDF bulk export, navigates to another page, waits, navigates back. The bell panel still shows the completed job and Download still works (within the 2 h TTL).
- **US-4:** On the Overview page, agent clicks a row in the Dispatcher Performance table. A slide-in drawer from the right opens with that dispatcher's name, initials avatar, gender-coloured ring, and salary history — same component rendered from `/dispatchers`.
- **US-5:** No OAuth "Connect Google Sheets" button appears in Settings; the `googleSheets*` columns are absent from the DB after the migration runs.
- **US-6:** A second device polling `/api/auth/google-sheets/connect` returns 404 after the change (the route is deleted, not 500ing).
- **US-7:** An agent who still has a valid Google Sheets token stored at release time loses access to nothing the app still uses — the drop-column migration is purely additive removal; no downstream route reads the tokens anymore.

## Scope of change

### Part 1 — Remove Google Sheets (deletions + PDF swap)

#### Files to delete

| Path | Reason |
|---|---|
| `src/lib/google-sheets.ts` | Core helper — unused after swap |
| `src/app/api/auth/google-sheets/connect/route.ts` | OAuth init |
| `src/app/api/auth/google-sheets/callback/route.ts` | OAuth callback |
| `src/app/api/auth/google-sheets/disconnect/route.ts` | OAuth disconnect |
| `src/app/api/staff/[id]/export/sheets/route.ts` | Per-dispatcher Sheets export |
| `src/app/api/overview/export/sheets/route.ts` | Overview Sheets export |
| `src/app/api/payroll/upload/[uploadId]/export/sheets/route.ts` | Per-upload Sheets export |
| Corresponding `src/lib/*/sheets-*.ts` helpers (if any) | Dead after above |

#### Prisma schema + migration

- Remove from `Agent` model:
  ```prisma
  googleSheetsAccessToken  String?
  googleSheetsRefreshToken String?
  googleSheetsTokenExpiry  DateTime?
  ```
- Create a new migration `20260424_drop_google_sheets_fields/migration.sql` with three `ALTER TABLE "Agent" DROP COLUMN` statements. No backfill needed.
- Leave historical migration `20260413_add_google_sheets_tokens` untouched (Prisma migration history is append-only).

#### Environment variables to remove

- `GOOGLE_SHEETS_CLIENT_ID`
- `GOOGLE_SHEETS_CLIENT_SECRET`
- `GOOGLE_SHEETS_REDIRECT_URI`

Remove references from:
- `.env.example` / README if present
- Deployment docs

#### Package dependencies

- Remove `googleapis` from `package.json` **only if no other code imports it**. Run `grep -r "googleapis\|from \"googleapis\"" src/` first.

#### UI surfaces that swap Sheets → PDF

| Component / route | Today | After |
|---|---|---|
| `src/components/payroll/payroll-history.tsx` — RowActions → Summary dropdown | CSV / Google Sheets | **CSV / PDF** (new per-upload summary PDF) |
| `src/components/payroll/export-buttons.tsx` — salary-table header ("Sync to Google Sheets") | Sync to Google Sheets | **Download PDF** |
| `src/components/payroll/salary-table.tsx` ~L445, L614 | Inline sheets button | **Download PDF** |
| `src/components/staff/history-tab.tsx` ~L91 | Sheets export action | **Download PDF** (YTD salary history PDF) |
| `src/components/dashboard/overview-export.tsx` ~L60 | Sheets export action | **Download PDF** (dispatcher + branch performance PDF) |
| `src/components/settings/settings-client.tsx` | Google Sheets connect/disconnect card | **Removed** (simplify Settings) |
| `src/app/(dashboard)/settings/page.tsx` | Loads `googleSheets*` fields | Drop those selects |

#### New PDF endpoints (replacements for the deleted `*/sheets` routes)

| Route | Returns | Source of truth |
|---|---|---|
| `GET /api/payroll/upload/[uploadId]/export/pdf` | Single PDF: one table of per-dispatcher totals (Net / Base / Incentive / Petrol / Penalty / Advance) for the upload | Re-uses `getSalaryRecordsByUpload` |
| `GET /api/staff/[id]/export/pdf` | Single PDF: dispatcher YTD salary history table | Re-uses `getDispatcherSalaryHistory` |
| `GET /api/overview/export/pdf?from=&to=&branches=` | Single PDF: dispatcher performance + branch summary table | Re-uses `getOverviewExportData` |

All three are **synchronous `GET` endpoints** that return `Content-Type: application/pdf` with `Content-Disposition: attachment`. Trigger via `window.open(…)` — no bulk-export job machinery needed.

PDF layout: reuse `@react-pdf/renderer` components already in `src/lib/payroll/pdf-generator.ts`. Extract a new `src/lib/pdf/summary-table.tsx` that renders a generic "header + table" PDF with the project's design tokens (Manrope/Inter fonts already loaded).

---

### Part 2 — Downloads Center

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Notification Bell (header)             │
│                                                         │
│   ┌──────────┐  ← existing BulkJobsIndicator overlay    │
│   │ progress │                                          │
│   └──────────┘                                          │
│         │ click                                         │
│         ▼                                               │
│   ┌─────────────────────────────────────────────────┐   │
│   │ Downloads                            [Clear all]│   │
│   │ ─────────────────────────────────────────────── │   │
│   │  ● In progress                                  │   │
│   │     PDF export · Feb 2026 · 42/95 files · 44%   │   │
│   │     ╭─ progress bar ─╮                          │   │
│   │                                                 │   │
│   │  ✓ Ready                                        │   │
│   │     CSV export · Mar 2026          [Download]   │   │
│   │     Just now                                    │   │
│   │                                                 │   │
│   │  ✓ Ready                                        │   │
│   │     PDF export · Jan 2026          [Download]   │   │
│   │     12 min ago                                  │   │
│   │                                                 │   │
│   │  ✗ Failed                                       │   │
│   │     CSV export · Feb 2026          [Retry]      │   │
│   │     Authentication timed out                    │   │
│   │                                                 │   │
│   │                                                 │   │
│   │  Expires after 2 hours. [See all exports →]     │   │
│   └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### Data sources

No new persistence required — the existing `bulk-job.ts` Redis store already keeps jobs keyed by `bulk-job:<jobId>` with a 2-hour TTL and groups them by agent in `bulk-job:active:<agentId>`.

Three changes to make completed jobs listable:

1. Introduce a **completed set** `bulk-job:recent:<agentId>` (bounded list, up to 20 entries, LPUSH + LTRIM on transition to done/failed).
2. Add `GET /api/dispatchers/month-detail/bulk/recent` — returns last 10 jobs (active + recently-completed, merged, sorted by `updatedAt` desc).
3. Keep the per-job `/status` and `/download` endpoints unchanged.

#### New React component

`src/components/dashboard/downloads-panel.tsx`

- Renders as a click-target popover anchored to the notification bell.
- Polls `/recent` every 3 s while open (same cadence as the indicator).
- Reads the active set from the existing `BulkJobsIndicator` watched ref to avoid double fetches. Share state via a module-level store or a React context in `bulk-jobs-indicator.tsx` so both the ring overlay and the panel read the same job list.
- Uses the existing `announceBulkExportStarted` event so a newly-started job appears instantly.
- **Download button** calls the existing `/api/dispatchers/month-detail/bulk/[jobId]/download` endpoint.
- **Retry button** (for failed jobs) re-posts to `/start` with the same `{ year, month, format }` and announces the new jobId.
- **Clear all** hits a new `DELETE /api/dispatchers/month-detail/bulk/recent` (only clears the recent set, not active jobs).

#### Bell affordance

The notification bell already has a click handler that opens the notifications panel. **Split** the panel into two tabs:

```
┌─ Notifications ─┬─ Downloads ─┐
│   [existing]    │             │
└─────────────────┴─────────────┘
```

A red dot on **Downloads** when any job is `running` OR any completed job was finalized < 10 s ago (so the user sees the "just ready" affordance even if they didn't see the toast). The dot clears when the tab is opened.

#### Toast behaviour (adjusted)

Keep the success toast with its **Download** action (it's the fastest path for engaged users). But:
- Reduce duration from 30 s → **15 s** — the bell panel is now the canonical surface.
- Drop the *[Download]* action from the *queued* toast (already gone).
- When the toast's Download is clicked, highlight the corresponding row in the Downloads panel for 2 s (subtle flash).

---

### Part 3 — Dispatcher Performance row click → deep-link

**Decision:** open the drawer on `/dispatchers?highlight=<id>`, not in-place on Overview. Rationale: the dispatcher page already owns the `StaffDispatcher` data, the `DispatcherDrawer` component, and its surrounding context (incentive/petrol toggles, weight tier popover, avatar). A deep-link avoids duplicating the data load and keeps one authoritative place for drill-down.

#### Component changes

- `src/components/dashboard/top-dispatchers.tsx`:
  - Each row becomes a Next.js `<Link href={\`/dispatchers?highlight=\${d.id}\`}>` (same-tab navigation).
  - Add `cursor-pointer`, focus ring, and `aria-label="Open salary history for <name>"`.
  - No client-side fetch, no drawer state here.
- `src/components/dispatchers/dispatchers-client.tsx`:
  - Read `?highlight=<id>` via `useSearchParams()` on mount.
  - When present, find the matching dispatcher in the already-loaded list → scroll the row into view → open `DispatcherDrawer` automatically → clear the URL param via `window.history.replaceState(null, '', '/dispatchers')` so refresh doesn't re-open.
  - If the id doesn't match any dispatcher (e.g. cross-agent or deleted), silently ignore — don't error-toast.

#### Accessibility

- Links are keyboard-accessible by default (Enter activates).
- Focus ring visible on the row while it has keyboard focus.
- `aria-label` includes dispatcher name for screen readers.

---

## Test plan (TDD-first — write these before code)

> All tests live in `src/**/__tests__/` next to the code they exercise. Run via `npm run test`.

### Part 1 — Sheets removal

- **P1-T1** `migration.test.ts`: after applying `20260424_drop_google_sheets_fields`, `SELECT column_name FROM information_schema.columns WHERE table_name = 'Agent' AND column_name LIKE 'googleSheets%'` returns zero rows.
- **P1-T2** `routes.test.ts`: `fetch('/api/auth/google-sheets/connect')` returns 404 (deleted route). Same for `/callback`, `/disconnect`, `/export/sheets` (all three `*/export/sheets` paths).
- **P1-T3** `payroll-export.test.ts`: `GET /api/payroll/upload/:id/export/pdf` with a valid upload returns `200`, `Content-Type: application/pdf`, non-empty body, and `Content-Disposition: attachment; filename="*.pdf"`.
- **P1-T4** `payroll-export.test.ts`: same endpoint returns 404 for an upload owned by a different agent (agentId scope).
- **P1-T5** `staff-export.test.ts`: `GET /api/staff/:id/export/pdf` returns a PDF for the correct agent, 404 for other agents.
- **P1-T6** `overview-export.test.ts`: `GET /api/overview/export/pdf?from=…&to=…` honours filters and returns a PDF.
- **P1-T7** `ui.test.tsx` (Playwright or RTL): rendering Settings page contains no "Google Sheets" text and no connect button.
- **P1-T8** `ui.test.tsx`: Payroll History row → Summary dropdown shows **CSV** and **PDF** only.
- **P1-T9** `grep-test.sh`: CI-level assertion `! git grep -E 'googleapis|googleSheets|Google Sheets|Sync to Google|/export/sheets'` returns exit code 0 after the change. (Runs in pre-push hook.)

### Part 2 — Downloads Center

- **P2-T1** `bulk-job.test.ts`: `updateJob(jobId, { status: 'done' })` LPUSHes the jobId into `bulk-job:recent:<agentId>` and LTRIMs to 20.
- **P2-T2** `bulk-job.test.ts`: jobs older than the TTL are absent from `listRecent` results.
- **P2-T3** `bulk-job.test.ts`: `listRecent(agentId)` returns merged active + completed, sorted by `updatedAt` desc, capped at 10.
- **P2-T4** `downloads-panel.test.tsx`:
  - Open panel, see 3 completed + 1 running job rendered in correct order.
  - Click Download on a completed job → `fetch('/api/…/download')` called once.
  - Click Retry on a failed job → new job's jobId appears at the top.
  - Click Clear all → `DELETE /recent` called, list empties.
- **P2-T5** `downloads-panel.test.tsx`: after `announceBulkExportStarted({ jobId: 'abc', … })`, the panel shows that job immediately (before any poll).
- **P2-T6** `integration.spec.ts` (Playwright): start a CSV export, refresh page, reopen bell → Download button for the finished job works end-to-end.
- **P2-T7** `downloads-panel.test.tsx`: bell red-dot appears when a job transitions running → done within the last 10 s; disappears after opening the Downloads tab.

### Part 3 — Dispatcher Performance drawer (via deep-link)

- **P3-T1** `top-dispatchers.test.tsx`: each row renders as a `<a>` with `href="/dispatchers?highlight=<id>"`.
- **P3-T2** `top-dispatchers.test.tsx`: each row has an `aria-label` containing the dispatcher name.
- **P3-T3** `dispatchers-client.test.tsx`: mount with `?highlight=<valid-id>` → the matching dispatcher row is scrolled into view **and** `DispatcherDrawer` is rendered for that dispatcher.
- **P3-T4** `dispatchers-client.test.tsx`: after the drawer opens, the URL is cleared to `/dispatchers` (via `replaceState`) so refresh doesn't re-trigger.
- **P3-T5** `dispatchers-client.test.tsx`: `?highlight=<id-that-does-not-exist>` is silently ignored — no drawer, no error toast.
- **P3-T6** Playwright E2E: from Overview, click a Dispatcher Performance row → navigates to `/dispatchers` → drawer is open → URL has no `?highlight` param.

## Rollout plan

1. **Branch**: `feature/sheets-removal-downloads-center`.
2. **Phase 1 — tests first** (all P1/P2/P3 tests written, red).
3. **Phase 2 — Sheets removal** (deletes + PDF endpoints) — P1 tests go green.
4. **Phase 3 — Downloads Center** (Redis changes → `/recent` endpoint → panel) — P2 tests go green.
5. **Phase 4 — Drawer** (new `GET /api/staff/[id]` if missing → TopDispatchers click wiring) — P3 tests go green.
6. **Phase 5 — Migration prod**: run `prisma migrate deploy` in maintenance window. Since the only risk is losing refresh tokens (zero downstream impact), this is effectively zero-risk.
7. **Merge + delete branch** per project workflow in `@context/ai-interaction.md`.

### Migration risk notes

- The `DROP COLUMN` is *not* reversible without backup. Since we're removing an unused integration, that's fine.
- Any agents mid-OAuth at release time will get a 404 on their callback. Acceptable collateral — the flow is going away permanently.
- No R2 objects to clean up (Sheets export never stored blobs).

## Decisions (user-confirmed)

1. **Summary PDF format**: dense per-dispatcher table (one line per dispatcher: Name · Orders · Base · Incentive · Petrol · Penalty · Advance · Net).
2. **Downloads panel scope**: bulk jobs only. Synchronous CSV/PDF streams download via the browser's native download UI and are not tracked.
3. **Clear all**: hard-clear — `DELETE /recent` wipes the agent's recent list immediately.
4. **Dispatcher Performance row click**: deep-link to `/dispatchers?highlight=<id>` (not in-place). Keeps one authoritative place for the drawer + its data.

## Files touched (summary)

```
D  src/lib/google-sheets.ts
D  src/app/api/auth/google-sheets/**
D  src/app/api/**/export/sheets/route.ts
M  prisma/schema.prisma
A  prisma/migrations/20260424_drop_google_sheets_fields/migration.sql
M  src/components/payroll/payroll-history.tsx          (swap Sheets → PDF dropdown item)
M  src/components/payroll/export-buttons.tsx            (swap button label + endpoint)
M  src/components/payroll/salary-table.tsx              (remove Sync to Sheets)
M  src/components/staff/history-tab.tsx                 (swap)
M  src/components/dashboard/overview-export.tsx         (swap)
M  src/components/settings/settings-client.tsx          (remove connect card)
M  src/app/(dashboard)/settings/page.tsx                (drop tokens select)
A  src/app/api/payroll/upload/[uploadId]/export/pdf/route.ts
A  src/app/api/staff/[id]/export/pdf/route.ts
A  src/app/api/overview/export/pdf/route.ts
A  src/lib/pdf/summary-table.tsx                        (shared react-pdf layout)

M  src/lib/staff/bulk-job.ts                            (add recent set + listRecent)
A  src/app/api/dispatchers/month-detail/bulk/recent/route.ts    (GET + DELETE)
A  src/components/dashboard/downloads-panel.tsx
M  src/components/dashboard/notification-bell.tsx       (add Downloads tab)
M  src/components/dashboard/bulk-jobs-indicator.tsx     (export shared store)

M  src/components/dashboard/top-dispatchers.tsx         (rows become <Link>)
M  src/components/dispatchers/dispatchers-client.tsx    (read ?highlight=<id>, auto-open drawer, scroll into view, clear URL)
```

**Tests** (all added):

```
src/lib/staff/__tests__/bulk-job.test.ts
src/components/dashboard/__tests__/downloads-panel.test.tsx
src/components/dashboard/__tests__/top-dispatchers.test.tsx
src/app/api/**/__tests__/*-export.test.ts
e2e/sheets-removal.spec.ts          (Playwright)
e2e/downloads-center.spec.ts        (Playwright)
e2e/dispatcher-drawer.spec.ts       (Playwright)
scripts/grep-no-sheets.sh           (CI check)
```

## Success criteria

- `git grep -iE 'googleapis|googleSheets|google sheets|/export/sheets'` returns no hits.
- `prisma migrate status` clean, columns dropped, `npm run build` passes, all tests green.
- Manual smoke: on dev DB, the three flows (P1/P2/P3 user stories) are visibly correct from the UI.
- No regression in existing bulk-export CSV/PDF flows (the earlier fixes for the `BulkJobsIndicator` race + Neon retry + `announceBulkExportStarted` hook remain intact).
