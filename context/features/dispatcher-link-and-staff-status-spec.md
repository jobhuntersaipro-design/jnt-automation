# Spec — Dispatcher Slide-In on Salary Table + Active/Inactive Column on Staff Payroll

> Two related UX upgrades, scoped together because they each touch one tab and ship cleanly in one PR.
>
> Branch: `feature/dispatcher-link-and-staff-status`

---

## 1. Background

Decisions confirmed via clarifying Qs (this session):

| # | Question | Answer |
|---|---|---|
| 1 | Page scope for the slide-in modal | `/dispatchers/payroll/[uploadId]` only — the per-month dispatcher salary table (`SalaryTable` component). Not the AWB detail page. |
| 2 | Modal content | Reuse `DispatcherDrawer` (avatar + branch chips + history months). No new tabbed component. |
| 3 | Inactive UX on Staff Payroll | Show row dimmed, with an "Inactive" chip; inputs disabled; excluded from totals + payslip selection. |
| 4 | Status column placement on Staff Payroll | Separate new column, *before* the "Generate Payslip / Delete" cell. Don't replace the "Ready / Hours required" pill. |

---

## 2. Goals

### 2.1 Dispatcher slide-in on salary table

Make each dispatcher name on `/dispatchers/payroll/[uploadId]` a clickable button that opens the existing `DispatcherDrawer` for that person — same component already used on `/dispatchers?tab=settings`. User scrolls a payroll, spots a dispatcher of interest, clicks → drawer slides in showing salary history + branch chips + edit-recalculate, without leaving the page.

**Non-goals**:
- Not adding line-item / AWB detail to the modal — history-only, identical to the dispatchers-tab drawer.
- Not adding the slide-in to `/dispatchers/history/[salaryRecordId]` (the AWB page).
- Not changing what the drawer renders inside.

### 2.2 Active/Inactive column on Staff Payroll table

Add a "Status" column on `/staff?tab=payroll` showing each employee's active/inactive state with an editable toggle. Mirrors the existing toggle on `/staff?tab=settings` (shipped in `ddc37bf`). Inactive rows are visually dimmed; their inputs are disabled; they are excluded from the per-branch totals at the top and cannot be bulk-selected for payslip generation.

**Non-goals**:
- Not changing the DB schema (`Employee.isActive` already exists on prod).
- Not auto-hiding inactive employees — they stay visible (per Q3 answer).

---

## 3. Scope & Files

### 3.1 Slide-in modal on salary table

**Server-side data.** `DispatcherDrawer` consumes a full `StaffDispatcher` shape (`src/lib/db/staff.ts:9`) — avatar, gender, IC, assignments, weightTiers, bonusTiers, incentiveRule, petrolRule, isPinned, isComplete, firstSeen, rawIcNo. The salary table only carries `SalaryRecordRow` (dispatcherId, name, extId, …) — not enough.

Add a lazy fetch when the drawer opens.

- **New endpoint** `GET /api/staff/[id]` returning a single `StaffDispatcher` (extend the existing `[id]/route.ts` which currently only handles `DELETE`).
- **New helper** `getStaffDispatcherById(agentId, dispatcherId): Promise<StaffDispatcher | null>` in `src/lib/db/staff.ts`. Implementation: reuse the existing `getDispatchers` query shape but with `where: { id: dispatcherId, agentId }` and `take: 1`. Returns the same fully-hydrated row including `assignments`, `firstSeen`, `bonusTiers`, etc. Reuses the same row → StaffDispatcher mapping logic — extract that into a shared local function so the list query and the single-id query don't drift.
- **agentId scoping.** Same scoping pattern used everywhere else in this file (`agentId` field on Dispatcher + assignments-by-branch as the safety net). 404 if cross-tenant.

**Client-side UI** in `src/components/payroll/salary-table.tsx`:

1. Import `DispatcherDrawer` via `next/dynamic` (matches `dispatchers-client.tsx:20-21` pattern; avoids SSR cost on the salary page).
2. New state:
   - `drawerDispatcher: StaffDispatcher | null` — what the drawer renders.
   - `loadingDrawerId: string | null` — which dispatcherId is fetching, for the spinner.
3. Replace the static `<p>` at line 846 with a `<button type="button">` styled identically (same classes), `onClick={() => openDrawer(r.dispatcherId)}`. The button:
   - Adds `cursor-pointer hover:text-brand transition-colors` to signal it's interactive.
   - Disables itself + shows a 12px `Loader2` spinner next to the name when `loadingDrawerId === r.dispatcherId`.
   - Disabled in `editMode` (consistent with how the Pin button behaves at line 833).
4. `openDrawer(dispatcherId)`:
   - Sets `loadingDrawerId`.
   - `fetch('/api/staff/' + id, { credentials: 'include' })`.
   - On 200, sets `drawerDispatcher` (drawer renders from this), clears `loadingDrawerId`.
   - On error, `toast.error("Couldn't load dispatcher")`, clears `loadingDrawerId`.
5. Render `<DispatcherDrawer dispatcher={drawerDispatcher} onClose={() => setDrawerDispatcher(null)} onAvatarChange={...}>` at the bottom of the component (mirrors `dispatchers-client.tsx:703-707`).
6. **Avatar-change propagation**: when the drawer's `onAvatarChange` fires, update the matching `SalaryRecordRow.avatarUrl` so any avatar shown next to the name (currently no avatar on the salary table — confirm in the file) refreshes consistently. If the salary table has no avatar in the row, this callback is a no-op for now.
7. **Pin propagation**: the drawer doesn't currently expose pin/unpin so no change needed.

**No new pages, routes, or DB migrations.**

### 3.2 Active/Inactive column on Staff Payroll

**Server-side data.** `GET /api/employee-payroll/[month]/[year]` already loads employees from `getEmployees` which already returns `isActive` (per `ddc37bf`). Verify the route's response payload includes it; if not, surface it.

- **`PayrollEntry` shape** (`src/components/staff/payroll-tab.tsx:25-57`): add `isActive: boolean`.
- **API response payload**: ensure `isActive` flows through. Trace the route hand-off — currently the route maps employees → entries; just add the field to the projection.

**Client-side UI** in `src/components/staff/payroll-tab.tsx`:

1. Add `isActive: boolean` to `PayrollEntry`.
2. **New table column**: insert a `<th>` with header "Status" between the existing Net column (line ~730) and the trailing 150-wide cell (Generate Payslip + Delete). Width ~80px.
3. **Cell content** per row:
   - Toggle switch styled like the existing Settings-tab toggle (mirror `employee-list.tsx`'s active toggle component — extract or copy the pattern).
   - When the user toggles, optimistically update local state, fire `PATCH /api/employees/[id]` with `{ isActive: boolean }`, on error revert + toast.
   - Below the toggle: small chip — "Active" (emerald) or "Inactive" (gray).
4. **Inactive row treatment**:
   - Add `opacity-50` to the `<tr>` when `!entry.isActive`.
   - All `CalcCurrencyInput` and `HoursInput` cells get a `disabled` prop (need to extend those local inputs to support `disabled` + `pointer-events-none` + `cursor-not-allowed`).
   - The row's bulk-select checkbox is hidden / disabled.
   - The Generate Payslip button is hidden — replaced by an em-dash cell.
   - The Delete button stays enabled (so you can still delete an inactive one).
5. **Totals exclusion** (`totals` useMemo around line 358): `displayedEntries.filter(e => e.isActive).reduce(…)`. Inactive entries don't contribute to Net Payout / Total Gross / EPF / SOCSO / EIS summary cards.
6. **Bulk-select exclusion**:
   - `toggleSelectAll` only adds active ids.
   - Auto-clear from `selectedIds` if a row gets toggled to inactive.
7. **Confirm & Save**: Inactive entries should still be sent to the server so their saved-state for the month persists, OR skipped entirely. Recommendation: **skip** — don't post payroll for inactive employees, since their salary intent is "no payroll this month". The server endpoint already upserts on `(employeeId, month, year)` so skipping doesn't accidentally retain stale state, but it also doesn't *clear* a previously-saved record. **Open question** — see §6.

**No DB migration needed** (`Employee.isActive` already exists per the `20260427_add_employee_is_active` migration).

---

## 4. UX Details

### 4.1 Slide-in interaction

| Aspect | Behavior |
|---|---|
| Click target | The full dispatcher name `<button>` cell. Click → drawer animates in from the right. |
| Loading state | 12px `Loader2` spinning next to the name; button disabled mid-fetch (~100–300ms typically). |
| Stacking | The drawer's overlay (`bg-on-surface/30`) layers over the salary table at z-40 (matches existing pattern). Salary edit-mode banner still visible underneath. |
| Close | Click the X, click the overlay, or press Escape (`DispatcherDrawer` already wires Escape at line 34-40). |
| Edit-mode collision | While the salary table is in edit mode (`editMode === true`), the dispatcher name button is `disabled` to prevent accidentally drifting attention. (Same disabled treatment as the existing Pin button.) |
| Mobile | The drawer already has `w-120 max-w-full` so it goes full-bleed on phones. No new responsive work. |

### 4.2 Inactive-row treatment

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ☐  AHMAD BIN CHE …  PHG3795069  …  RM 1,372.00 …  RM 6.75 …  [Status]  │  ← active
│ avatar (full opacity)                                       Active 🟢   │
├──────────────────────────────────────────────────────────────────────────┤
│  ─  AYU ALYA …       PHG3505040  …  RM    0.00 …  RM 0.00 …  [Status]  │  ← inactive (50% opacity, inputs disabled)
│ avatar (50% opacity)                                       Inactive ⚪  │
└──────────────────────────────────────────────────────────────────────────┘
```

- The chip text + emerald-vs-gray hue is the canonical active/inactive signal; the dimmed row is reinforcing.
- Toast on toggle: matches Settings tab — `"<NAME> marked active"` / `"<NAME> marked inactive"` (uppercase per the existing convention).
- Optimistic update: the toggle flips immediately; server roundtrip is fire-and-forget with revert-on-error.

---

## 5. Implementation Plan

### 5.1 Slide-in modal

| Step | File | Note |
|---|---|---|
| 1 | `src/lib/db/staff.ts` | Add `getStaffDispatcherById(agentId, id)` returning `StaffDispatcher \| null`. Extract the row-mapping closure used by `getDispatchers` into a private helper to share. |
| 2 | `src/app/api/staff/[id]/route.ts` | Add `GET` handler. agentId-scoped. Returns 404 on miss / cross-tenant. |
| 3 | `src/components/payroll/salary-table.tsx` | Dynamic-import `DispatcherDrawer`; add state; replace name `<p>` with `<button>`; wire fetch + render. |
| 4 | manual QA | Load `/dispatchers/payroll/<id>` → click a name → drawer opens → close → click another name → drawer reopens with new dispatcher. Verify edit-mode disables click. |

### 5.2 Active/Inactive column

| Step | File | Note |
|---|---|---|
| 1 | `src/lib/db/employees.ts` | Verify the payroll-entries projection returns `isActive`. Add it if missing. |
| 2 | `src/app/api/employee-payroll/[month]/[year]/route.ts` | Pass `isActive` through to the response payload. |
| 3 | `src/components/staff/payroll-tab.tsx` | Add `isActive` to `PayrollEntry`; new "Status" column header + cell; row-level dimming + input disabling; totals + bulk-select exclusion; toggle handler with toast. |
| 4 | `src/components/staff/payroll-tab.tsx` | Extend `CalcCurrencyInput` + `HoursInput` to honor a `disabled` prop. |
| 5 | manual QA | Toggle Active → Inactive on a row → verify dim, disabled inputs, chip flip, totals drop, bulk-select clears, toast fires. Reload to confirm persistence. Toggle back. |

### 5.3 Tests

- **Unit**: extend the existing employees DB tests if any exist (`src/lib/db/__tests__/employees.test.ts` if present). Add a case verifying `isActive` is round-tripped.
- **No new e2e** — Playwright already covers basic auth flow; manual QA on prod is the verification step (matches the project workflow).

### 5.4 Verification

- `npx tsc --noEmit` — zero new errors (the existing `parser.test.ts` Buffer-cast is pre-existing, OK to leave).
- `npm run test` — all green.
- `npm run build` — clean.
- Manual QA on dev (port 3001 if 3000 is hung) and a prod smoke test post-deploy.

---

## 6. Open Questions

1. **Inactive Confirm-&-Save behavior**: when the user clicks Confirm & Save, should inactive entries be (a) skipped (no upsert), or (b) upserted with zeros so the DB record reflects "no salary this month"? Recommendation: **(a) skipped**. If user wants to "clear" an inactive month they can still do it manually — but auto-zeroing risks wiping an intentional save. Need a yes/no on this before implementing.
2. **Drawer avatar-change → SalaryTable**: the salary table currently doesn't render an avatar in the row. If we ever add one, the `onAvatarChange` callback should refresh that row. For now it's a no-op.
3. **Drawer pin/unpin → SalaryTable**: same as #2 — drawer doesn't pin, so no propagation. If history-tab gains pinning later, revisit.
4. **Sort behavior on Status column**: not in scope for this spec. Inactive rows still sort by whatever sort key is active. Acceptable.

---

## 7. Out of Scope

- AWB-line-item view inside the slide-in.
- Bulk Active/Inactive toggle on the Staff Payroll table (could be a future filter-bar action).
- Default-to-hidden inactive employees on the Settings tab — already filterable via the existing Status filter, behavior unchanged.
- Changing the dispatcher salary table's column structure (no new columns there).
- Mobile-specific design changes — the existing horizontal scroll covers both.

---

## 8. Migration / Risk

- **No DB migration**: `Employee.isActive` was added on `20260427_add_employee_is_active` (already on prod). The new column is purely a UI surface for an existing field.
- **API risk**: `GET /api/staff/[id]` is a new endpoint. Has to enforce `agentId` scope to avoid cross-tenant leakage. Test pattern matches the existing `DELETE` handler.
- **Backward compat**: if `isActive` is missing from the API response (because we forgot to surface it), the client treats the entry as `isActive === true` (default). That's the safer fallback than treating an undefined as inactive.
