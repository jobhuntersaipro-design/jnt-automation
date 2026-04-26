# Spec — Driver Position on Staff Management

> Branch: `feature/driver-position`
> Style: TDD (red → green → refactor) per `/tdd-orchestrator` invocation.

---

## 1. Background — confirmed scope

| # | Question | Answer |
|---|---|---|
| 1 | Driver vs Dispatcher | **Driver is a new staff role**, separate from Dispatcher. New `EmployeeType` enum value `DRIVER`. |
| 2 | Pay model | **Monthly basic pay** — same as Supervisor / Admin. No hours, no hourly wage. |
| 3 | Payslip template | **Reuse Template 1 (Supervisor / Admin)** with `POSITION = "DRIVER"`. No new template. |
| 4 | Branch detail tile | **Yes — add a 5th 'Drivers' card** to the People-at-branch grid. |

---

## 2. Goals

Add a `DRIVER` Employee position fully analogous to Supervisor / Admin: appears in the type filter on `/staff?tab=settings`, selectable in the Add/Edit Employee drawer, payroll-eligible on `/staff?tab=payroll` (basic-pay-only formula), generates payslips via Template 1, and counted on the Branch detail "People at branch" section.

**Non-goals**:
- No new payslip template, no new pay model, no new statutory rules.
- Not changing how Dispatcher works (`/dispatchers/*` untouched).
- Not adding a Driver dashboard tile, role-filtered branch employees view, or driver-specific reports.
- No data migration of existing employees — DRIVER is purely additive.

---

## 3. Scope & Files

### 3.1 Schema (Prisma)

[prisma/schema.prisma:236-240](prisma/schema.prisma#L236-L240) — add `DRIVER` to `enum EmployeeType`. Generate a migration `add_driver_employee_type`. Run against the dev Neon branch via `prisma migrate dev`.

```prisma
enum EmployeeType {
  SUPERVISOR
  ADMIN
  STORE_KEEPER
  DRIVER
}
```

> Prod migration: requires explicit `prisma migrate deploy` against prod. **Out of scope of this branch — flagged for the user to run after merge** (matches the project's prior pattern for prod migrations).

### 3.2 Server-side TS / API

| File | Change |
|---|---|
| [src/lib/payroll/employee-salary-save.ts:74-82](src/lib/payroll/employee-salary-save.ts#L74-L82) | Per-type gating already says "Sup/Admin → basicPay only; Store Keeper → hourly". Driver is **basic-pay-only**, so the gating logic is `isStoreKeeper = type === "STORE_KEEPER"` — Driver naturally falls into the non-store-keeper branch. **No code change needed**, but the JSDoc `@param emp.type` comment should be updated to mention DRIVER for clarity. |
| [src/app/api/employees/route.ts:58](src/app/api/employees/route.ts#L58) | Type-validation list: `["SUPERVISOR","ADMIN","STORE_KEEPER"]` → add `"DRIVER"`. |
| [src/app/api/employees/[id]/route.ts:68](src/app/api/employees/[id]/route.ts#L68) | `VALID_TYPES` const → add `"DRIVER"`. The `effectiveType === "STORE_KEEPER"` branch (lines 105-106) stays — Driver is correctly NOT a store keeper. |
| [src/lib/db/branches.ts:52-54](src/lib/db/branches.ts#L52-L54) | Counts for branch detail. Add `else if (e.type === "DRIVER") driverCount++;`. |
| [src/lib/db/branches.ts:128, :324](src/lib/db/branches.ts) | `BranchEmployeeRow.type` and the `as` cast widen to include DRIVER. |
| [src/lib/staff/payslip-generator.ts:60](src/lib/staff/payslip-generator.ts#L60) | `employeeType` union widens to include `DRIVER`. The position-label record at line 100 gets `DRIVER: "DRIVER"`. The `isStoreKeeper` check (line 127, 241) stays — Driver renders Template 1 because `isStoreKeeper === false` for it. |

### 3.3 Client-side UI

| File | Change |
|---|---|
| [src/components/staff/payroll-tab.tsx:28](src/components/staff/payroll-tab.tsx#L28) | `PayrollEntry.type` union widens to include `"DRIVER"`. |
| [src/components/staff/payroll-tab.tsx:233-237](src/components/staff/payroll-tab.tsx#L233-L237) | `TYPE_LABELS` adds `DRIVER: "Driver"`. |
| All `entry.type === "STORE_KEEPER"` checks in this file | unchanged — Driver behaves like Sup/Admin. |
| [src/components/staff/employee-drawer.tsx:11, :29, :35](src/components/staff/employee-drawer.tsx#L29) | Type union widens. The position dropdown options array gets a 4th option `{ value: "DRIVER", label: "Driver" }`. `TYPE_LABELS` mirrors. The `type !== "STORE_KEEPER"` branches (line 448, 470) stay correct. |
| [src/components/staff/employee-list.tsx:18, :32, :38, :185, :349](src/components/staff/employee-list.tsx) | Type union widens. `TYPE_LABELS` adds Driver. `TYPE_TINTS` adds Driver color (proposed: `bg-rose-50 text-rose-700`). The filter dropdown's hardcoded array `(["SUPERVISOR","ADMIN","STORE_KEEPER"] as EmployeeType[])` adds `"DRIVER"`. |
| [src/app/(dashboard)/branches/[code]/page.tsx:50-91](src/app/(dashboard)/branches/[code]/page.tsx#L50-L91) | Add `driverCount` computation. Insert a 5th `peopleCards` entry between Admins and Store keepers (or at the end — discuss in §6.2). New Lucide icon: **`Car`**, tinted rose-50/rose-700 to match the new TYPE_TINT. The grid stays `grid-cols-2 sm:grid-cols-4` — but with 5 cards on a 4-col grid the last wraps; safe at all breakpoints since each card is fixed-width. Optional: bump to `lg:grid-cols-5` if visual balance matters. |

### 3.4 Tests (RED first per `/tdd-orchestrator`)

**`src/lib/payroll/__tests__/employee-salary-save.test.ts`** — extend the "Sup/Admin" describe block to also cover Driver. Add a new `describe("computeEmployeeSalaryForSave — Driver")` with three cases mirroring the Sup/Admin block:

1. `forces workingHours and hourlyWage to 0 for DRIVER even when client sends them` — gross excludes OT.
2. `preserves basicPay as the only wage source for Driver`.
3. `combines basicPay with allowances for gross` — symmetric to the existing Sup case.

**`src/lib/staff/__tests__/payslip-generator.test.ts`** (if it exists) — add a Driver case that asserts `position === "DRIVER"` and the rendered template matches Template 1's shape (no WAGES (X HOUR) row).

**No new e2e tests** — Playwright already exercises the existing flows. Manual QA on dev covers the new add/edit/delete path.

### 3.5 Verification

- `npx tsc --noEmit` — must be clean for changed files (1 pre-existing parser.test.ts Buffer-cast error is acceptable).
- `npm run test` — all 290 existing pass + new Driver tests pass.
- `npm run build` — succeeds.
- Manual QA on dev: create a Driver employee → fill IC + branch → save payroll → generate payslip → branch detail shows the count.

---

## 4. TDD Sequence (red-green-refactor)

| Phase | Activity |
|---|---|
| **RED 1** | Add Driver tests in `employee-salary-save.test.ts` — they fail because TS rejects `"DRIVER"` as a valid `EmployeeType`. |
| **RED 2** | Add the schema enum value + run `prisma migrate dev` + `prisma generate`. Tests still fail — JS code paths don't yet honor DRIVER. |
| **GREEN 1** | Update the JSDoc comment + extend the union types in payroll-tab/drawer/list/payslip-generator/branches.ts — TS is happy. Tests now pass because Driver naturally falls into the non-storekeeper branch. |
| **GREEN 2** | Wire DRIVER into the four UI surfaces (payroll TYPE_LABELS, drawer dropdown, list filter, payslip POSITION label). |
| **GREEN 3** | Add the 5th branch-detail card with the `Car` icon. |
| **GREEN 4** | API validation lists update so POST/PATCH accept DRIVER. |
| **REFACTOR** | (Optional) extract the hardcoded `["SUPERVISOR","ADMIN","STORE_KEEPER"]` array — appearing in 3+ files — into a shared `EMPLOYEE_TYPES` const in a new `src/lib/staff/employee-types.ts` so future additions touch one file. Only do this if doing so doesn't bloat the PR. |
| **VERIFY** | typecheck → tests → build → manual QA → commit. |

---

## 5. Risk

- **Schema migration on prod**: `prisma migrate deploy` against prod is required after merge. Adding an enum value is non-breaking (existing rows unaffected, Prisma client regenerates) — safe.
- **Type narrowing**: any unhandled exhaustive `switch` on `EmployeeType` would surface a TS error. None exist in the current codebase (verified by grep).
- **Branch detail card grid**: 5 cards on a `grid-cols-2 sm:grid-cols-4` layout means the 5th card sits alone on its own row at md+. Acceptable visually; if not, bump to `lg:grid-cols-5`.

---

## 6. Open / deferred items

1. **5th card placement** — current draft inserts after Admins. If user prefers a different order (e.g. Drivers right after Dispatchers), trivial 1-line change.
2. **TYPE_TINT color** — proposing rose-50/rose-700 (no other type uses rose). Open to a different palette if the user has a preference.
3. **Refactor common type list** — optional, see §4 REFACTOR. Default is to skip.

---

## 7. Out of scope

- A "Driver license number" field on the Employee record.
- A driver-specific report or dashboard.
- Filtering branch employees by role on the branch detail page (the cards link to anchors only).
- Per-driver mileage tracking, vehicle assignments, or fleet management.
- Any change to how Dispatcher works — Drivers and Dispatchers remain conceptually distinct.
