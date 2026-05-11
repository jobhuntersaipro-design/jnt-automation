# Spec — New Positions (Marketing / Assistant / Quality Control / Account Executive) + Universal Temporary/Permanent Subtype

> Branch: `feature/positions-and-universal-subtype`
> Style: TDD (red → green → refactor) per `/tdd-orchestrator` invocation.

---

## 1. Background — confirmed scope

User request: *"Write a spec to add staff and positions in the following: 1. Marketing 2. Assistant 3. Quality Control 4. Account Executive. Also, make sure all the roles now have permanent and temporary just like store keeper. Make sure to show it in payroll and setting page for staff."*

Today the `Employee.type` enum has 4 values (`SUPERVISOR`, `ADMIN`, `STORE_KEEPER`, `DRIVER`). Only `STORE_KEEPER` and `ADMIN` have a Temporary/Permanent sub-tag — and they live on two separate role-specific columns (`storeKeeperSubtype`, `adminSubtype`) that both reuse the same `StoreKeeperSubtype` Postgres enum (`TEMPORARY` / `PERMANENT`). The 2026-05-06 store-keeper-subtype feature + the admin-subtype follow-up cemented the pay-model coupling: Temp SK and Temp Admin use hours × rate; everything else uses monthly basicPay (see `src/lib/payroll/employee-salary-save.ts:102-138`).

This spec **decouples the chip from the pay model** for the new roles. Subtype becomes a universal metadata chip on every employee row; pay logic for SK + Admin is untouched.

| # | Question | Answer (locked in via the 2026-05-11 AskUserQuestion round) |
|---|---|---|
| 1 | Pay-model semantics of Temporary on the new roles + on Sup/Driver? | **Metadata only.** Sup/Driver/Marketing/Assistant/QC/AE all stay on monthly `basicPay` regardless of subtype. The chip is informational only — payroll formula, statutory math, and payslip rendering for these six types are unchanged. Existing SK + Admin pay rules untouched. |
| 2 | DB column shape for subtype? | **One universal nullable column `subtype StoreKeeperSubtype?` on Employee.** Backfill from `storeKeeperSubtype` + `adminSubtype` in the same migration, then drop the two role-specific columns. Cleanest model; future-proof if new roles get sub-tagged. |
| 3 | Payslip layout for the 4 new positions? | **All use Template 1 (`BASIC PAY` row + allowances).** Position label changes verbatim (`MARKETING`, `ASSISTANT`, `QUALITY CONTROL`, `ACCOUNT EXECUTIVE`). Template 2 (`WAGES (X HOUR/DAY)`) stays exclusive to Temp SK + Temp Admin (untouched). Template 3 (combined dispatcher+employee) still works for any role with a linked dispatcher — addition rows render BASIC PAY for the new roles, identical to Sup/Admin/Driver today. |
| 4 | Default subtype on form submit? | **Required pick (no silent default).** When the user creates or edits an employee of any type, the drawer's submit validation requires a Temporary/Permanent selection. Existing rows that land with `subtype = null` post-migration render a muted "Set subtype" chip until the user picks one. No backfill assigns a value automatically — agents fill them in incrementally, identical to the 2026-05-06 SK pattern. |
| 5 | Visible everywhere or scoped to specific surfaces? | **Visible on Staff Settings tab list, Staff Payroll tab row, Employee Drawer header, and Branch Detail employee rows.** Hidden on payslip PDFs (per scope §7). |
| 6 | Apply subtype to Dispatcher records? | **No.** Dispatcher remains a separate model with its own `assignments` lifecycle. Subtype is Employee-only. |

---

## 2. Goals

- Add four `EmployeeType` enum values: `MARKETING`, `ASSISTANT`, `QUALITY_CONTROL`, `ACCOUNT_EXECUTIVE`.
- Unify the existing two subtype columns into one universal `Employee.subtype` column (still `StoreKeeperSubtype` Postgres enum — `TEMPORARY` / `PERMANENT`). Backfill in migration so no row loses its existing tag.
- Surface the subtype chip on **every** non-null type — the four legacy roles AND the four new roles — across the Staff Settings list, Staff Payroll table, Employee Drawer, and Branch Detail page.
- Preserve SK + Admin pay semantics byte-for-byte. The pay-model gate (`usesUnitsRate`) keeps reading the same column, just under the new universal name.
- Update the position dropdown in Add/Edit Employee drawer to include all 8 positions in a consistent order.
- Update the type filter on the employee list to include all 8 positions.
- Update Branch Detail "People at branch" cards — split the existing 4 role-count cards into 8 (or fold the 4 new roles into a single "Other staff" card per §6.3 — open question).

**Non-goals**:
- No changes to the pay formula, statutory rules, or payslip Template 2 for SK or Admin.
- No new payslip variant for the four new roles — they share Template 1 with Sup/Admin/Driver.
- No subtype-driven differentiation in net salary, statutory deductions, or per-tier commission.
- No bulk classification UI / one-shot script. Agents fill subtype in incrementally on existing rows.
- No subtype on Dispatcher records.
- No subtype on combined dispatcher+employee Template 3 rendering — the position-line label stays as-is.

---

## 3. Scope & Files

### 3.1 Schema (Prisma)

`prisma/schema.prisma:244-303` — extend `EmployeeType` enum + replace the two role-specific subtype columns with a single universal column.

```prisma
enum EmployeeType {
  SUPERVISOR
  ADMIN
  STORE_KEEPER
  DRIVER
  MARKETING            // NEW
  ASSISTANT            // NEW
  QUALITY_CONTROL      // NEW
  ACCOUNT_EXECUTIVE    // NEW
}

enum StoreKeeperSubtype {
  TEMPORARY
  PERMANENT
}
// Note: the enum name is kept (changing it would cascade through generated
// types + every import site). The semantics are now universal — "subtype on
// any employee", not "store-keeper-only sub-tag".

model Employee {
  // ... existing fields unchanged ...
  type        EmployeeType
  subtype     StoreKeeperSubtype?  // NEW — universal, replaces the next two lines
  // storeKeeperSubtype StoreKeeperSubtype?  // DROPPED via migration step 3
  // adminSubtype       StoreKeeperSubtype?  // DROPPED via migration step 3
  // ... rest unchanged ...
}
```

**Migration: `prisma/migrations/20260512_universal_subtype/migration.sql`**

Three statements in one migration (single transaction; Neon's Postgres handles enum value adds + column add + UPDATE + column drop atomically):

```sql
-- 1. Extend the EmployeeType enum (4 new values).
ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'MARKETING';
ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'ASSISTANT';
ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'QUALITY_CONTROL';
ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'ACCOUNT_EXECUTIVE';

-- 2. Add the new universal subtype column.
ALTER TABLE "Employee" ADD COLUMN "subtype" "StoreKeeperSubtype";

-- 3. Backfill from the two legacy columns. Per row, take whichever is
--    non-null. They can't both be set (existing API validators reject
--    cross-role values), so a COALESCE is safe.
UPDATE "Employee"
   SET "subtype" = COALESCE("storeKeeperSubtype", "adminSubtype")
 WHERE "storeKeeperSubtype" IS NOT NULL OR "adminSubtype" IS NOT NULL;

-- 4. Drop the legacy columns.
ALTER TABLE "Employee" DROP COLUMN "storeKeeperSubtype";
ALTER TABLE "Employee" DROP COLUMN "adminSubtype";
```

> ⚠️ **Postgres caveat**: `ALTER TYPE ... ADD VALUE` inside a multi-statement migration only works on Postgres 12+ when the enum value isn't referenced in the same transaction. We don't reference the new values until application code re-deploys, so this is safe. Verified pattern matches the 2026-04-26 Driver migration which used the same idiom.

**Apply to dev**: `npx prisma migrate dev --name universal_subtype` against `ep-bold-unit-aml1ct5y`.

**Prod follow-up (manual)**: `prisma migrate deploy` (or `npx prisma db execute --file=prisma/migrations/20260512_universal_subtype/migration.sql` with prod URL) before users can pick the new positions on prod. Until then, picking Marketing from the dropdown will succeed in the UI but error on the server insert. Matches the project's standing pattern for schema migrations (see Driver feature note 2026-04-26).

### 3.2 Helper module — consolidate the two subtype helpers into one universal module

Replace `src/lib/staff/store-keeper-subtype.ts` + `src/lib/staff/admin-subtype.ts` with a single `src/lib/staff/employee-subtype.ts`. Keep the legacy file names as thin re-export shims for one cycle so the diff stays bounded; remove them in the refactor step.

**New file `src/lib/staff/employee-subtype.ts`**:

```ts
/**
 * Employee subtype (Temporary / Permanent).
 *
 * Universal across all EmployeeType values (Supervisor / Admin / Store
 * Keeper / Driver / Marketing / Assistant / Quality Control / Account
 * Executive). Stored on Employee.subtype as a nullable StoreKeeperSubtype
 * column — the legacy enum name is kept for backwards compatibility with
 * pre-existing Postgres types.
 *
 * Pay-model semantics: subtype is METADATA ONLY for Sup/Driver and the four
 * new roles. SK + Admin retain their existing pay-model coupling — see
 * `computeEmployeeSalaryForSave` for the gate. The gate now reads
 * `employee.subtype` instead of the two role-specific columns.
 */
export type EmployeeSubtype = "TEMPORARY" | "PERMANENT";

export type EmployeeTypeName =
  | "SUPERVISOR"
  | "ADMIN"
  | "STORE_KEEPER"
  | "DRIVER"
  | "MARKETING"
  | "ASSISTANT"
  | "QUALITY_CONTROL"
  | "ACCOUNT_EXECUTIVE";

export const EMPLOYEE_SUBTYPE_VALUES: readonly EmployeeSubtype[] = [
  "TEMPORARY",
  "PERMANENT",
] as const;

export const EMPLOYEE_SUBTYPE_LABEL: Record<EmployeeSubtype, string> = {
  TEMPORARY: "Temporary",
  PERMANENT: "Permanent",
};

export const EMPLOYEE_SUBTYPE_CHIP_CLASS: Record<EmployeeSubtype, string> = {
  TEMPORARY: "bg-orange-50 text-orange-700",
  PERMANENT: "bg-emerald-50 text-emerald-700",
};

export function isValidEmployeeSubtype(v: unknown): v is EmployeeSubtype {
  return v === "TEMPORARY" || v === "PERMANENT";
}

export const EMPLOYEE_TYPE_VALUES: readonly EmployeeTypeName[] = [
  "SUPERVISOR",
  "ADMIN",
  "STORE_KEEPER",
  "DRIVER",
  "MARKETING",
  "ASSISTANT",
  "QUALITY_CONTROL",
  "ACCOUNT_EXECUTIVE",
] as const;

export function isValidEmployeeType(v: unknown): v is EmployeeTypeName {
  return EMPLOYEE_TYPE_VALUES.includes(v as EmployeeTypeName);
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate a subtype value. Universal — every non-null type accepts
 * TEMPORARY or PERMANENT, or `null` (unset).
 */
export function validateEmployeeSubtype(subtype: unknown): ValidationResult {
  if (subtype === null || subtype === undefined) return { ok: true };
  if (!isValidEmployeeSubtype(subtype)) {
    return { ok: false, error: "Invalid subtype — must be TEMPORARY or PERMANENT" };
  }
  return { ok: true };
}
```

**Pay-model gate stays in `employee-salary-save.ts`** but now reads `emp.subtype` instead of `emp.storeKeeperSubtype` / `emp.adminSubtype`:

```ts
const isUnitsRate =
  (emp.type === "STORE_KEEPER" && emp.subtype !== "PERMANENT") ||
  (emp.type === "ADMIN" && emp.subtype === "TEMPORARY");
```

Behavior preserved by inspection: any row that today reads SK `storeKeeperSubtype === null` falls into the units-rate branch (untagged → temp); after migration that same row has `subtype === null` (the backfill carried `null` through), so the gate keeps firing. Symmetric for admin: untagged Admin had `adminSubtype === null` → basicPay; post-migration `subtype === null` and the gate's `=== "TEMPORARY"` check fails → still basicPay. **Zero behaviour drift for SK + Admin.**

### 3.3 Legacy helper shims (one cycle)

Keep `src/lib/staff/store-keeper-subtype.ts` and `src/lib/staff/admin-subtype.ts` as thin re-export shims so the inevitable forgotten import site doesn't break the build:

```ts
// src/lib/staff/store-keeper-subtype.ts
export {
  EMPLOYEE_SUBTYPE_LABEL as STORE_KEEPER_SUBTYPE_LABEL,
  EMPLOYEE_SUBTYPE_CHIP_CLASS as STORE_KEEPER_SUBTYPE_CHIP_CLASS,
  EMPLOYEE_SUBTYPE_VALUES as STORE_KEEPER_SUBTYPE_VALUES,
  isValidEmployeeSubtype as isValidStoreKeeperSubtype,
  validateEmployeeSubtype as validateSubtypeForType, // (drop the type arg; accept any)
  type EmployeeSubtype as StoreKeeperSubtype,
  type EmployeeTypeName,
} from "./employee-subtype";
```

```ts
// src/lib/staff/admin-subtype.ts — same pattern with the ADMIN_* names
```

Note: `validateSubtypeForType` and `validateAdminSubtypeForType` previously took a `type` argument and rejected cross-role values. Under the universal model that check is meaningless (subtype applies to every type). The shim drops the type arg signature — call sites pass `(type, subtype)` today; we update them to `(subtype)` in the API route changes below. Both legacy files get deleted in the refactor step once all call sites are updated.

### 3.4 Server-side TS / API

| File | Change |
|---|---|
| `src/lib/db/employees.ts:1-33` | `StaffEmployee.storeKeeperSubtype` + `.adminSubtype` fields **replaced** by a single `subtype: EmployeeSubtype \| null`. Mapper (`employees.ts:75-103`) reads `e.subtype`. `type` field's literal union extended with the 4 new values via the `EmployeeType` import (no manual widening — `@/generated/prisma/client` regenerates the enum). |
| `src/lib/db/employees.ts:35-73` | `filters.subtype` already accepts `StoreKeeperSubtype`. The Prisma `where` becomes `subtype: filters.subtype` (single column, no `OR` union). Keep accepting the legacy `?subtype=` query string verbatim. |
| `src/app/api/employees/route.ts:55-138` | (a) **POST** destructures `subtype` (single field) instead of `storeKeeperSubtype` + `adminSubtype`. (b) Type validation widened: `if (!isValidEmployeeType(type)) return 400`. (c) Subtype validation: `validateEmployeeSubtype(subtype)`. (d) Persist `data: { ..., subtype: subtype ?? null }`. (e) Tolerance: if request body still sends `storeKeeperSubtype` or `adminSubtype` (older client cached in the browser), pre-merge them into `subtype`: `const incomingSubtype = subtype ?? storeKeeperSubtype ?? adminSubtype ?? null;`. |
| `src/app/api/employees/route.ts:24-32` | **GET** filter logic unchanged — `?subtype=TEMPORARY` already worked under the union pattern, now resolves to a single-column filter. |
| `src/app/api/employees/[id]/route.ts:55-220` | **PATCH** validation: drop the per-role validators (`validateSubtypeForType`, `validateAdminSubtypeForType`) — replace with `validateEmployeeSubtype(subtype)`. Drop the auto-clear blocks (lines 178-203) since subtype is universal — no need to clear it when type changes. Same tolerance layer for legacy field names. The pay-model template gate (`effectiveUsesUnitsRate`, lines 167-176) now reads `effectiveSubtype = subtype !== undefined ? subtype : employee.subtype` — single resolution. |
| `src/lib/db/branches.ts:54-57, :132-133, :324-334` | `BranchEmployeeRow.type` union widened to all 8 values. New counter fields on `BranchOverviewCard`: `marketingCount`, `assistantCount`, `qualityControlCount`, `accountExecutiveCount`. `getBranchesOverview` counts each role explicitly. `BranchEmployeeRow.storeKeeperSubtype` + `.adminSubtype` replaced with `.subtype: StoreKeeperSubtype \| null`. |
| `src/lib/payroll/employee-salary-save.ts:42-58, :102-138` | `EmployeeForSave.type` widened. `storeKeeperSubtype` + `adminSubtype` fields **replaced** by `subtype: StoreKeeperSubtype \| null`. Gate at lines 113-115 rewritten as above (reads `emp.subtype`). The four new types fall through to the basicPay branch alongside Sup/Driver — verified by inspection of the gate. |
| `src/lib/staff/payslip-generator.ts:60, :114-119, :147-151, :277` | `EmployeePayslipInput.employeeType` union widened. `POSITION_LABEL` Record extended: `MARKETING: "MARKETING"`, `ASSISTANT: "ASSISTANT"`, `QUALITY_CONTROL: "QUALITY CONTROL"`, `ACCOUNT_EXECUTIVE: "ACCOUNT EXECUTIVE"`. `storeKeeperSubtype` field renamed to `subtype` (also widens to all-types semantically — but pay-model gating still only fires for SK + Admin). The 4 new types render via Template 1 (BASIC PAY row). |
| `src/lib/staff/store-keeper-subtype.ts` | One-cycle shim — see §3.3. |
| `src/lib/staff/admin-subtype.ts` | One-cycle shim — see §3.3. |
| `prisma/seed.ts` (if it touches subtype fields) | Update any seed entries that wrote `storeKeeperSubtype` / `adminSubtype` to write `subtype` instead. Probably no-op — current seed file likely predates subtype work. |

### 3.5 Client-side UI

| File | Change |
|---|---|
| `src/components/staff/employee-list.tsx:13-51` | Drop imports from `store-keeper-subtype.ts` + `admin-subtype.ts`; import the new universal symbols from `employee-subtype.ts`. `EmployeeType` local union widened to all 8 values. `TYPE_LABEL` Record extended with `MARKETING: "Marketing"`, `ASSISTANT: "Assistant"`, `QUALITY_CONTROL: "Quality Control"`, `ACCOUNT_EXECUTIVE: "Account Executive"`. `TYPE_CHIP_CLASS` extended with four distinct tints (see §3.6 palette table). |
| `src/components/staff/employee-list.tsx:81-90, :210-266` | Filter dropdown options list extended to all 8 types (instead of the hardcoded 4). Subtype filter dropdown becomes **always-visible** (it now applies to every type, not just SK/Admin). Selecting a subtype no longer auto-narrows the type filter — that hint becomes meaningless. |
| `src/components/staff/employee-list.tsx:~349-425` | Row chip stack: render the type chip + a universal subtype chip when `emp.subtype` is set. Drop the role-specific branches (`emp.type === "STORE_KEEPER"` / `=== "ADMIN"`) — the subtype chip renders unconditionally when `subtype !== null`, regardless of type. Untagged rows render a muted `"Set subtype"` chip (clickable → opens drawer to the subtype field). |
| `src/components/staff/employee-drawer.tsx:11-44` | Same import swap. `TYPE_OPTIONS` array extended with the four new entries. `EmployeeType` local union widened. |
| `src/components/staff/employee-drawer.tsx:78-100, :144-170` | Form state: `subtype` (single field) instead of `storeKeeperSubtype` + `adminSubtype`. `validate()` requires `subtype !== null` for **any** type at submit time (per §1 row 4 — required pick). Submit payload sends `{ subtype }` only. |
| `src/components/staff/employee-drawer.tsx:~440` | The subtype `<Field label="Subtype">` is **always rendered** (no `type === "STORE_KEEPER"` wrapper). Drop the second subtype field — only one dropdown exists now. |
| `src/components/staff/employee-drawer.tsx:~280` | Header chip stack: subtype chip renders unconditionally when `subtype` is set. |
| `src/components/staff/payroll-tab.tsx:20-26, :39-43, :103-110, :288-293, :1095-1108` | Same import swap. `PayrollEntry.type` union widened. `storeKeeperSubtype` + `adminSubtype` fields **replaced** by `subtype`. `usesUnitsRate` helper at line 103 rewritten to read `entry.subtype`. `TYPE_LABELS` Record extended with the 4 new labels. Row chip rendering at lines 1095-1108 collapsed to a single subtype chip block. |
| `src/components/staff/payroll-tab.tsx — table` | New positions appear in the existing payroll table just like Sup/Admin/Driver. Per-row Pay sub-label stays `"Basic Pay"` for the 4 new roles (since they don't use units-rate). Hours cell shows `—` for these roles, matching Sup/Driver behaviour today. |
| `src/app/(dashboard)/branches/[code]/page.tsx:13-32, :70-73, :265-280` | Same import swap. `EMPLOYEE_TYPE_LABEL` Record extended with the 4 new labels. Role count tally extended: `marketingCount`, `assistantCount`, `qualityControlCount`, `accountExecutiveCount`. Subtype chip rendering at lines 265-280 collapsed to a single block reading `e.subtype`. |
| `src/app/(dashboard)/branches/[code]/page.tsx — People at branch grid` | The existing 4-card grid (Dispatchers / Supervisors / Admins / Store keepers / Drivers — actually 5 cards) extends to **9 cards** total (Dispatchers + 8 employee roles), arranged `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9` (or 3×3 grid on mobile, 5+4 on desktop). See §6.3 — open question for fallback layout. |
| `src/components/staff/payroll-tab.tsx — Save & Recalculate path` | No change required to `recalcEntry` or `computeEmployeeSalaryForSave` once the field rename lands — the basicPay branch already handles all non-SK, non-Temp-Admin types. |
| Any other call site that hardcoded `["SUPERVISOR", "ADMIN", "STORE_KEEPER", "DRIVER"]` | Grep for that exact array and extend to 8. Hits expected: 1 in `employee-list.tsx:210`, 1 in `employees/route.ts:86`, 1 in `employees/[id]/route.ts:101`. Replace with `EMPLOYEE_TYPE_VALUES` from `employee-subtype.ts`. |

### 3.6 Color palette for the 4 new type chips

Pick colors that don't clash with the existing 5 (blue/purple/amber/rose/emerald — Dispatcher overlaps emerald on stamp-transparent UI but not on chips). Subtype chips already use orange (TEMP) + emerald (PERM) — those need to read against any role tint.

| Role | Tailwind tint | Hex preview | Rationale |
|---|---|---|---|
| `MARKETING` | `bg-pink-50 text-pink-700` | `#fdf2f8` / `#be185d` | Marketing = warm, attention-grabbing. |
| `ASSISTANT` | `bg-cyan-50 text-cyan-700` | `#ecfeff` / `#0e7490` | Cool, neutral — assistant role. |
| `QUALITY_CONTROL` | `bg-slate-100 text-slate-700` | `#f1f5f9` / `#334155` | Subdued, "inspector" feel. |
| `ACCOUNT_EXECUTIVE` | `bg-violet-50 text-violet-700` | `#f5f3ff` / `#6d28d9` | Premium/sales tone. |

(Open to swap any of these — see §6.4.)

### 3.7 Tests (RED first per `/tdd-orchestrator`)

**A. New unit-test file `src/lib/staff/__tests__/employee-subtype.test.ts`** — pure tests on the new helper module.

```
describe("isValidEmployeeType")
  ✓ accepts all 8 legacy + new values
  ✓ rejects MANAGER (not in enum)
  ✓ rejects lowercase / null / number

describe("isValidEmployeeSubtype")
  ✓ accepts TEMPORARY + PERMANENT
  ✓ rejects null, undefined, "CASUAL", number

describe("validateEmployeeSubtype")
  ✓ accepts null / undefined as "no subtype"
  ✓ rejects invalid enum value with 400-style error

describe("EMPLOYEE_TYPE_VALUES")
  ✓ exports exactly 8 values in canonical order
```

**B. Extend `src/lib/payroll/__tests__/employee-salary-save.test.ts`** with regression tests for the 4 new types.

```
describe("computeEmployeeSalaryForSave — new positions (basicPay branch)")
  ✓ MARKETING + null subtype: basicPay drives gross; workingHours forced to 0
  ✓ MARKETING + TEMPORARY subtype: still basicPay (metadata only — subtype does NOT flip pay model)
  ✓ ASSISTANT + PERMANENT: basicPay
  ✓ QUALITY_CONTROL + TEMPORARY: basicPay (regression guard)
  ✓ ACCOUNT_EXECUTIVE + null: basicPay
```

These tests are the contractual fence for the metadata-only decision in §1 row 1. If a future spec couples Temporary on the new roles to units-rate, these tests must be updated together.

**C. Extend `src/app/api/employees/__tests__/employees-route.test.ts`** (or create the file if it doesn't exist yet — the 2026-05-06 spec deferred this; mirroring the existing fixture pattern from `branches-overview.test.ts` is acceptable).

```
describe("POST /api/employees — new positions")
  ✓ accepts type=MARKETING + subtype=TEMPORARY
  ✓ accepts type=ASSISTANT + subtype=PERMANENT
  ✓ accepts type=QUALITY_CONTROL + subtype=null
  ✓ accepts type=ACCOUNT_EXECUTIVE + subtype=PERMANENT
  ✓ rejects type=MANAGER (400)
  ✓ rejects subtype=CASUAL on any type (400)
  ✓ accepts legacy `storeKeeperSubtype` field name on STORE_KEEPER (back-compat shim)
  ✓ accepts legacy `adminSubtype` field name on ADMIN (back-compat shim)

describe("PATCH /api/employees/[id] — universal subtype")
  ✓ changing type from STORE_KEEPER to MARKETING preserves the subtype value
    (no longer auto-cleared — universal model means the chip survives)
  ✓ changing subtype on any type persists without auto-clear
  ✓ pay-model template (basicPay vs hourlyWage) re-evaluates on type+subtype change
```

**D. Manual QA scenarios** (per the project's existing convention of light component-test coverage):

1. Create new `Marketing` employee with `Temporary` → row shows pink + orange chips; drawer header shows pink + orange chips.
2. Create new `Account Executive` with `Permanent` → row shows violet + emerald chips.
3. Edit existing untagged `Store Keeper` → drawer requires a subtype pick at submit; before picking, row shows muted "Set subtype" chip.
4. Change a `Quality Control` employee from `Temporary` to `Permanent` → chip flips emerald; no error.
5. Filter list by `Marketing` → only marketing rows visible.
6. Filter list by `Permanent` (subtype filter, no type filter) → every role's permanent rows surface.
7. Filter by `Marketing` + `Temporary` → narrow to that intersection.
8. Go to Staff Payroll tab → new positions appear in the table; basicPay column accepts entry; hours column shows `—`; subtype chip on row.
9. Save & Recalculate with a Marketing row → basicPay + allowances → gross → statutory → net all compute. Generate payslip → Template 1 PDF renders with `MARKETING` position line.
10. Open `/branches/[code]` → "People at branch" cards include Marketing / Assistant / QC / AE counts.
11. SK + Admin pay regression: a Temporary Store Keeper from before the migration still computes hours × rate (subtype was backfilled).

### 3.8 Verification

- `npx tsc --noEmit` — clean for changed files (1 pre-existing `parser.test.ts` Buffer-cast error on main stays; doesn't block merge).
- `npm run test` — all existing tests pass + new subtype/role tests pass. Expected count: ~340/340 (337 baseline + ~6 new).
- `npm run build` — succeeds.
- Manual QA flow above.
- Verify the migration applied to dev Neon branch by querying `\d "Employee"` and confirming `subtype` exists + the two legacy columns are gone.

---

## 4. TDD Sequence (red-green-refactor)

| Phase | Activity |
|---|---|
| **RED 1** | Add `isValidEmployeeType` test asserting `MARKETING` accepted. Fails — module doesn't exist yet. |
| **RED 2** | Add `computeEmployeeSalaryForSave` regression tests for the 4 new types. Fail with TS errors — `"MARKETING"` not assignable to current `EmployeeType` literal. |
| **RED 3** | Add the POST `/api/employees` tests for the new types. Fail — server rejects unknown enum. |
| **GREEN 1** | Schema migration: extend `EmployeeType` + add `subtype` column + backfill + drop legacy columns. `prisma generate` → TS knows the 4 new values + the new column. |
| **GREEN 2** | Create `src/lib/staff/employee-subtype.ts`. Update `store-keeper-subtype.ts` + `admin-subtype.ts` to thin shims. Test A passes. |
| **GREEN 3** | Update `computeEmployeeSalaryForSave` to read `emp.subtype`. Test B passes. |
| **GREEN 4** | Update POST + PATCH validators in `/api/employees/*`. Drop per-role validators. Add legacy-field tolerance. Test C passes. |
| **GREEN 5** | Update `getEmployees` mapper + `getBranchesOverview` + `payslip-generator.ts` + all 5 client component imports — typecheck drives this; one error at a time. |
| **GREEN 6** | UI wiring: type filter, position dropdown, subtype dropdown, chip stack, role count cards. Verified by manual QA flow. |
| **REFACTOR** | Delete `store-keeper-subtype.ts` + `admin-subtype.ts` shims once all call sites import from `employee-subtype.ts`. Grep guard: `! grep -r "STORE_KEEPER_SUBTYPE_LABEL\|ADMIN_SUBTYPE_LABEL\|storeKeeperSubtype\|adminSubtype" src/`. |
| **VERIFY** | typecheck → tests → build → manual QA on dev (8 positions × 2 subtypes × payroll round-trip) → commit. |

---

## 5. Risk

- **Schema migration**: adding enum values + adding a nullable column + UPDATE + DROP two columns is non-trivial. The DROP is the riskiest step — once gone, no rollback short of restoring from Neon point-in-time backup. **Mitigation**: take a Neon branch off prod (matches the 2026-04-22 person-identity playbook) before running `migrate deploy` on prod. The branch acts as a 30-day rollback window. The dev branch is regenerated freely.
- **Behavior drift on Temp SK / Temp Admin**: the most load-bearing risk. The pay-model gate moves from two columns to one. Mitigation: §4 GREEN 3's tests pin the Temporary-SK + Temporary-Admin paths; the existing 22 tests in `employee-salary-save.test.ts` continue to cover the legacy semantics. If any test changes its expected output, the diff is suspicious and we stop.
- **Forgotten field references**: anywhere in the codebase that reads `e.storeKeeperSubtype` or `e.adminSubtype` after the schema change will TS-error on missing fields. The one-cycle shim files mitigate this for symbol-level imports, but **field accesses on the row object** must be hand-fixed. Grep is the safety net — see GREEN 6's exit grep.
- **People-at-branch grid layout**: jumping from 5 cards to 9 cards may break the 4-card grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`) — see §6.3 for the open layout question.
- **Type enum widening cascades**: 5 files hardcoded the four-value union as a literal string union. Mitigation: `EMPLOYEE_TYPE_VALUES` from `employee-subtype.ts` becomes the single source of truth; all hardcoded arrays must reference it. Grep guard in REFACTOR step.
- **Stale browser cache after deploy**: a user with a stale JS bundle that still sends `storeKeeperSubtype` won't break — the API tolerance layer (§3.4 row 3) merges legacy fields into `subtype`. Without the tolerance the request would 400 once the validator strictly enforces the new field name.
- **Prod-only data state**: existing prod employees land with `subtype` populated for SK + Admin via backfill; Sup/Driver still `null`. Agents incrementally fill subtype for legacy Sup/Driver rows. The muted "Set subtype" chip is the UX nudge.

---

## 6. Open / deferred items

1. **Subtype filter visibility** — current draft makes the subtype dropdown **always visible** since it applies universally now. Alternative: keep it hidden until at least one row has `subtype !== null`. Default in this spec: always-visible. Agent's call.
2. **Required vs optional subtype on submit** — §1 row 4 specifies "required pick". Alternative: keep it nullable in the UI (defaults to "Unset" chip), so adding subtype to old rows isn't blocking on the next edit. The required-pick path matches the 2026-05-06 SK precedent; the nullable path is gentler on legacy data. Default: required.
3. **People-at-branch card layout** — 9 cards in the current 5-card row breaks visual rhythm. Three alternatives:
   - **(a) 9-card horizontal scroll** on mobile, `grid-cols-9` on desktop.
   - **(b) 3×3 grid** at all viewports.
   - **(c) Fold the 4 new roles into a single "Other staff" card** that expands on hover/click to break out the per-role counts. Keeps the page's existing visual density.
   - Default in this spec: (b) 3×3 grid. Cleanest. Open to a Pencil mockup if needed.
4. **Chip palette for the 4 new types** — see §3.6. Pink/cyan/slate/violet picks are subjective. Open to a Pencil mockup that swaps any of them.
5. **Position label casing on payslip** — `QUALITY CONTROL` (two words, uppercase) vs `QUALITY_CONTROL` (underscore). Spec defaults to two-word uppercase per Template 1 convention. Same call for `ACCOUNT EXECUTIVE`.
6. **Legacy column drop timing** — spec drops `storeKeeperSubtype` + `adminSubtype` in the same migration as the universal column add. Alternative: a two-phase migration (Phase 1: add `subtype`, dual-write from app code; Phase 2: drop the two columns once dual-write proven). The single-phase migration is faster but loses the rollback window mid-flight. The two-phase migration adds a release boundary.
7. **Cross-tenant subtype filter on the GET endpoint** — picking a subtype today already filters within the agent scope. Confirmed; not changing.
8. **Bulk classify-existing UI** — out of scope. Agents do it row-by-row.

---

## 7. Out of scope

- **Pay-model coupling for Sup/Driver/Marketing/Assistant/QC/AE Temporary subtype** — explicitly rejected in §1 row 1. A follow-up spec can address this if user feedback after live use suggests Temp = hourly on the new roles.
- **Payslip Template 2** for the 4 new positions — they use Template 1 only. Adding Template 2 support requires the pay-model coupling above.
- **Subtype on Dispatcher records** — Dispatcher remains untagged. Adding subtype to Dispatcher would require a separate migration + lots of UI surfaces (dispatcher list, drawer, history, branch counts).
- **Combined dispatcher+employee Template 3 changes** — already handles all 8 types via the existing addition-row code path. Position-line label flows through `POSITION_LABEL` extension automatically.
- **Subtype-driven differences in payroll math** — penalty, advance, allowances, statutory, KWSP rules: all untouched.
- **Subtype-aware dashboard / chart breakdowns** — Overview charts show per-role aggregates but not per-subtype splits. Future feature.
- **Renaming `StoreKeeperSubtype` Postgres enum** to `EmployeeSubtype` — would cascade through generated TS + every migration history file. Keep the legacy name; only the column name + variable names change.
- **Renaming `EmployeeType` → `Position`** — out of scope, would touch every type-discriminating switch in the codebase.
- **Removing the `EmployeeType.STORE_KEEPER` / `ADMIN` value entirely** — definitely out of scope. Both keep their identity + pay-model coupling.

---

## 8. Estimate

| Phase | Effort | Notes |
|---|---|---|
| Schema + migration | 0.5h | One migration file, one Prisma client regen. |
| Helper consolidation (employee-subtype.ts + shims) | 1h | Pure module, well-tested. |
| API route updates (POST + PATCH + GET) | 1h | Drop two validators, add one. Legacy-field tolerance is the trickiest bit. |
| Server-side cascading (mapper, branches.ts, payslip generator) | 1.5h | TS errors drive the rename — mostly mechanical. |
| Client UI wiring (employee-list, employee-drawer, payroll-tab, branches/[code]) | 2.5h | Subtype chip moves to universal block; type dropdown extends 4 → 8; "people at branch" grid relayout. |
| Tests (helper + payroll-save + API route) | 1.5h | ~6 new test cases. |
| Manual QA | 1h | 11 scenarios per §3.7 D. |
| **Total** | **~9h** | Single-day spike. |

---

> **Prod deploy checklist**
>
> 1. Create Neon rollback branch off prod (`pre-universal-subtype-YYYYMMDD`).
> 2. `prisma migrate deploy` against prod.
> 3. Verify schema: `\d "Employee"` shows `subtype` column, no `storeKeeperSubtype` / `adminSubtype`.
> 4. Spot-check 5 production employee rows: Temp SK, Perm SK, Temp Admin, untagged Admin, untagged Sup. All should have `subtype` correctly backfilled or null per the rules.
> 5. Ship the application code. Smoke test: create one Marketing employee on prod, save a payroll month, generate a payslip. All work.
> 6. Verify no errors surface from the legacy-field tolerance shim (any client cached more than ~24h after deploy might still send the old field name).
> 7. Drop the rollback Neon branch after 30 days if no incidents.
