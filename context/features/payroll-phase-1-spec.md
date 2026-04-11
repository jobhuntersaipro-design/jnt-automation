# Payroll Page — Phase 1: Page Shell + State Machine + Upload History

## Overview

Replace the separate Upload page with a unified Payroll page. Upload zone
is embedded at the top. Past confirmed payrolls shown as a history list below.
Agent uploads new files at the top, views/exports past months in the history.

## Expected Outcome

After this phase:
- "Upload" removed from nav, replaced by "Payroll"
- Top section: branch + month selector + upload zone (state-based)
- Bottom section: history list of all past confirmed payrolls grouped by branch
- Branch + dispatcher filter on history list
- Stale job detection on page load
- Duplicate upload warning

---

## Route

`/payroll`

---

## Nav Change

```
Overview | Payroll | Staff
```

---

## Page Layout

### Top Section — Current Upload

Branch + Month/Year selectors (defaults: first branch, current month).
Main area renders based on current upload state for selected branch + month.

| State | UI shown |
|---|---|
| NONE | Upload zone |
| UPLOADING | Progress card |
| PROCESSING | Processing indicator |
| CONFIRM_SETTINGS | Settings confirmation step |
| NEEDS_ATTENTION | Setup banner + partial table |
| READY_TO_CONFIRM | Preview (Phase 2) |
| SAVED | "View in history ↓" + scroll link |
| FAILED | Error card + retry button |

### Upload Zone (NONE state)
```
┌──────────────────────────────────────────┐
│  📄  Upload delivery data                │
│  KPG001 — March 2026                     │
│  Drag & drop or click to browse          │
│  .xlsx / .xls only                       │
└──────────────────────────────────────────┘
```

### Processing Card
```
┌──────────────────────────────────────────┐
│  ⟳  Processing KPG001 — March 2026      │
│  Parsing delivery data...                │
│  Started 12 seconds ago                  │
└──────────────────────────────────────────┘
```
Polls `GET /api/upload/[uploadId]/status` every 2s.
Auto-transitions on terminal state.

### CONFIRM_SETTINGS State
```
┌──────────────────────────────────────────┐
│  ✓  File parsed — 18 dispatchers found  │
│  (16 known, 2 new)                       │
│                                          │
│  Before calculating, please confirm      │
│  staff settings are up to date for       │
│  March 2026.                             │
│                                          │
│  [Review Staff Settings ↗]              │
│  [Use Current Settings & Calculate →]   │
└──────────────────────────────────────────┘
```
- "Review Staff Settings" → opens `/staff` in new tab
- "Use Current Settings" → `POST /api/upload/[uploadId]/calculate`

### FAILED State
```
┌──────────────────────────────────────────┐
│  ✕  Processing failed                    │
│  [error message]                         │
│  [Retry]                                 │
└──────────────────────────────────────────┘
```

### SAVED State
```
┌──────────────────────────────────────────┐
│  ✓  March 2026 payroll confirmed         │
│  View in history ↓                       │
└──────────────────────────────────────────┘
```

---

## Bottom Section — Payroll History

### Filter Bar
- Branch MultiSelect — filter history by branch
- Dispatcher search — search by name or extId within results

### History List (grouped by branch)

```
KPG001 — Kepong
  March 2026    18 dispatchers   RM 42,380    [View]  [Export ▾]
  February 2026 18 dispatchers   RM 39,805    [View]  [Export ▾]

CRS001 — Cheras
  March 2026    16 dispatchers   RM 38,120    [View]  [Export ▾]
```

- "View" → navigates to `/payroll/[uploadId]` (Phase 3)
- "Export ▾" → dropdown: CSV / Google Sheets (Phase 4)
- Empty state: "No payroll records yet."

---

## Duplicate Upload Handling

If selected branch + month already has SAVED upload:
```
"Payroll for [Branch] — [Month Year] already exists.
Re-uploading will delete existing salary records.
Dispatcher settings will be kept.
This cannot be undone. Continue?"
```
Confirmed → delete SalaryRecords (cascade) + Upload row → proceed.

---

## Stale Job Detection

On page load:
```ts
await prisma.upload.updateMany({
  where: {
    agentId: session.user.id,
    status: "PROCESSING",
    updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
  },
  data: { status: "FAILED", errorMessage: "Processing timed out. Please retry." },
});
```

---

## API Routes

### `GET /api/payroll`
Returns all SAVED uploads for the agent, grouped by branch.
Used to populate history list.
```ts
Array<{
  uploadId: string
  branchCode: string
  month: number; year: number
  dispatcherCount: number
  totalNetPayout: number
}>
```

### `GET /api/payroll/[branchCode]/[month]/[year]`
Returns current upload state for selected branch + month.
```ts
{ upload: Upload | null; status: UploadStatus | "NONE" }
```

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/app/(dashboard)/payroll/page.tsx` | Create — server component |
| `src/components/payroll/payroll-state-machine.tsx` | Create — state-based rendering |
| `src/components/payroll/upload-zone.tsx` | Create — drag-and-drop |
| `src/components/payroll/processing-card.tsx` | Create — processing indicator |
| `src/components/payroll/confirm-settings-card.tsx` | Create — settings confirmation step |
| `src/components/payroll/payroll-history.tsx` | Create — history list |
| `src/components/payroll/payroll-history-filters.tsx` | Create — branch + dispatcher filter |
| `src/app/api/payroll/route.ts` | Create — GET history |
| `src/app/api/payroll/[branchCode]/[month]/[year]/route.ts` | Create — GET state |
| `src/components/nav/nav-links.tsx` | Modify — remove Upload, keep Payroll |

---

## Testing

1. Nav shows Overview, Payroll, Staff — no Upload
2. Select branch + month with no upload → upload zone shown
3. Drop valid file → UPLOADING → PROCESSING → CONFIRM_SETTINGS
4. Polling updates state every 2s
5. "Review Staff Settings" opens /staff in new tab
6. "Use Current Settings" → calculation starts
7. SAVED state shows "View in history ↓"
8. History list shows confirmed payrolls grouped by branch
9. Branch filter → history updates
10. Dispatcher search → filters history rows
11. Duplicate upload → warning dialog shown
12. Retry on FAILED → requeues job
13. Stale PROCESSING on load → auto-marked FAILED

## Status

Not started.
