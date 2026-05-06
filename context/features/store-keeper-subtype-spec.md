# Spec — Store Keeper Subtype (Temporary / Permanent)

> Branch: `feature/store-keeper-subtype`
> Style: TDD (red → green → refactor) per `/tdd-orchestrator` invocation.

---

## 1. Background — confirmed scope

User request: *"In staff management tab, change the store keeper role to temporary store keeper and permanent. Maybe just add a tag beside the store keeper. Make sure this is implemented to full CRUD also. This should be applied to store keeper only."*

| # | Question | Recommended answer (used by this spec) |
|---|---|---|
| 1 | New enum vs sub-tag on existing `STORE_KEEPER`? | **Sub-tag.** Keep `EmployeeType.STORE_KEEPER` unchanged so all existing per-type gating (hourly wage, payslip Template 2, statutory rules, payroll-tab UI) continues to work without a wave of `&&` widenings. Add a new optional `storeKeeperSubtype` enum field that is `null` for non-store-keepers and set to `TEMPORARY` or `PERMANENT` for store keepers. |
| 2 | Default value for new + existing store keepers? | **`PERMANENT`** for new store keepers selected via UI. **`null` (unset)` for existing store-keeper rows** post-migration — UI displays "—" until the user edits and picks one. No backfill (purely additive). |
| 3 | Required at create time? | **Optional in DB; required at form submit** when `type === STORE_KEEPER`. Keeps the API tolerant for existing callers but enforces UX completeness. |
| 4 | Affects payslip / payroll math? | **No.** Subtype is metadata only — no change to gross, statutory, or payslip rendering. The label may appear on the staff list and drawer header for clarity, but not on the PDF. |
| 5 | Visible on dispatcher / non-store-keeper rows? | **No.** The tag chip and dropdown render only when `type === STORE_KEEPER`. Switching type away from `STORE_KEEPER` clears subtype to `null` on save. |

---

## 2. Goals

Allow agents to classify each Store Keeper as **Temporary** or **Permanent**. Surface the classification:

- as a small chip beside the existing "Store Keeper" type chip on the employee list row,
- as a dedicated dropdown field in the Add/Edit Employee drawer (only shown when `type === STORE_KEEPER`),
- as a filter facet on the employee list (Temporary / Permanent / Any).

Full CRUD: settable on create, editable on update, persisted across reads, included in API responses, cleared on type change away from store keeper, deletable with the employee.

**Non-goals**:
- No new payslip variant — Template 2 unchanged.
- No new statutory or pay-formula behavior — `computeEmployeeSalaryForSave` untouched.
- No retroactive subtype assignment for existing rows — they default to `null` and the user fills them in over time.
- Not surfacing the subtype on `/branches/[code]` people-at-branch counters — that page already lumps all store keepers together; splitting the count is a future feature.
- No subtype for Supervisor / Admin / Driver / Dispatcher.

---

## 3. Scope & Files

### 3.1 Schema (Prisma)

[prisma/schema.prisma:236-241](prisma/schema.prisma#L236-L241) — add new optional enum + column on `Employee`.

```prisma
enum StoreKeeperSubtype {
  TEMPORARY
  PERMANENT
}

model Employee {
  // ... existing fields unchanged ...
  type                 EmployeeType
  storeKeeperSubtype   StoreKeeperSubtype?  // null unless type = STORE_KEEPER
  // ... rest unchanged ...
}
```

Migration: `prisma migrate dev --name add_store_keeper_subtype` against the dev Neon branch (`ep-bold-unit-aml1ct5y`). Additive — column is nullable, no backfill, no rewrite of existing rows. Enum DDL is `CREATE TYPE "StoreKeeperSubtype" AS ENUM ('TEMPORARY', 'PERMANENT');` followed by `ALTER TABLE "Employee" ADD COLUMN "storeKeeperSubtype" "StoreKeeperSubtype";`.

> Prod migration: requires explicit `prisma migrate deploy` against prod after merge — flagged as a manual follow-up step (matches the project's prior pattern for prod migrations, see Driver feature note 2026-04-26).

### 3.2 Server-side TS / API

| File | Change |
|---|---|
| [src/lib/db/employees.ts:1-30](src/lib/db/employees.ts#L1-L30) | `StaffEmployee` type adds `storeKeeperSubtype: "TEMPORARY" \| "PERMANENT" \| null`. The mapper at lines 59-83 spreads `e.storeKeeperSubtype ?? null`. Re-export `StoreKeeperSubtype` from `@/generated/prisma/client` for client-side typing. |
| [src/lib/db/employees.ts:32-58](src/lib/db/employees.ts#L32-L58) | Extend the `filters` arg with optional `storeKeeperSubtype?: StoreKeeperSubtype`. When passed, the Prisma `where` adds `storeKeeperSubtype: filters.storeKeeperSubtype`. Combine with `type: STORE_KEEPER` automatically — picking a subtype implies type = store keeper. |
| [src/app/api/employees/route.ts:34-152](src/app/api/employees/route.ts#L34-L152) | (a) Destructure `storeKeeperSubtype` from body. (b) New validation: when `type === "STORE_KEEPER"`, accept only `"TEMPORARY" \| "PERMANENT" \| null`; for any other type, reject non-null with `400` ("Subtype only applies to store keeper"). (c) Persist via `data.storeKeeperSubtype`. (d) Include in the response employee shape. |
| [src/app/api/employees/route.ts:18-26](src/app/api/employees/route.ts#L18-L26) | `GET` handler reads `?subtype=TEMPORARY\|PERMANENT` query param and forwards to `getEmployees`. |
| [src/app/api/employees/[id]/route.ts:30-145](src/app/api/employees/[id]/route.ts#L30-L145) | (a) Destructure `storeKeeperSubtype`. (b) Validate enum value when supplied. (c) **Auto-clear rule**: when `effectiveType !== "STORE_KEEPER"`, force `updateData.storeKeeperSubtype = null` regardless of payload (defense-in-depth — UI also clears it, but API guarantees consistency). When `type` changes from `STORE_KEEPER` → another value, the existing subtype is wiped. (d) When `type` changes TO `STORE_KEEPER` and no subtype supplied, leave it as-is (`null` if previously not a store keeper). The drawer's required-field validation handles the UX side. |
| [src/lib/db/branches.ts:128, :324, :328](src/lib/db/branches.ts) | `BranchEmployeeRow.storeKeeperSubtype` added as optional + select / map. **Optional** — only consumed if a future feature wants to display it on the branch detail employee row. Keeps the type stable for that page. |

### 3.3 Client-side UI

| File | Change |
|---|---|
| [src/components/staff/employee-list.tsx:18-41](src/components/staff/employee-list.tsx#L18-L41) | New `type StoreKeeperSubtype = "TEMPORARY" \| "PERMANENT"`. New `SUBTYPE_LABEL: Record<StoreKeeperSubtype, string>` = `{ TEMPORARY: "Temporary", PERMANENT: "Permanent" }`. New `SUBTYPE_CHIP_CLASS: Record<StoreKeeperSubtype, string>` = `{ TEMPORARY: "bg-orange-50 text-orange-700", PERMANENT: "bg-emerald-50 text-emerald-700" }` (rationale: orange = "less stable / temp", emerald = "stable / perm"; neither clashes with existing TYPE_CHIP_CLASS palette — blue/purple/amber/rose). |
| [src/components/staff/employee-list.tsx:60-90](src/components/staff/employee-list.tsx) | New filter state `filterSubtype: StoreKeeperSubtype \| ""`. Adds a dropdown next to the type filter that ONLY renders when `filterType === "STORE_KEEPER"` or `""` AND there is at least one store keeper in the dataset. Options: "All Store Keepers", "Temporary", "Permanent". Selecting a subtype auto-narrows `filterType` to `"STORE_KEEPER"` (UX shortcut). |
| [src/components/staff/employee-list.tsx:~349](src/components/staff/employee-list.tsx#L349) | Below the existing type chip in the table row, render a subtype chip when `emp.type === "STORE_KEEPER" && emp.storeKeeperSubtype`. If type is store keeper but subtype is `null`, render a muted "Set type" chip linking to the drawer. |
| [src/components/staff/employee-drawer.tsx:11-38](src/components/staff/employee-drawer.tsx#L11-L38) | Add `SUBTYPE_OPTIONS: { value: StoreKeeperSubtype; label: string }[]`. Add `SUBTYPE_LABEL` mirror. |
| [src/components/staff/employee-drawer.tsx:78-100](src/components/staff/employee-drawer.tsx#L78-L100) | New form state `const [storeKeeperSubtype, setStoreKeeperSubtype] = useState<StoreKeeperSubtype \| null>(employee?.storeKeeperSubtype ?? null);`. New dropdown open state `subtypeOpen`. |
| [src/components/staff/employee-drawer.tsx:144-168](src/components/staff/employee-drawer.tsx#L144-L168) | Extend `validate()` — if `type === "STORE_KEEPER"`, require `storeKeeperSubtype` set; produce `errors.storeKeeperSubtype = "Pick a subtype"` if missing. |
| [src/components/staff/employee-drawer.tsx:160-170](src/components/staff/employee-drawer.tsx#L160-L170) | Submit payload includes `storeKeeperSubtype: type === "STORE_KEEPER" ? storeKeeperSubtype : null`. |
| [src/components/staff/employee-drawer.tsx:~440](src/components/staff/employee-drawer.tsx#L440) | Insert a new `<Field label="Subtype" error={errors.storeKeeperSubtype}>` AFTER the Position field. The whole `<Field>` is wrapped in `{type === "STORE_KEEPER" && (...)}` — appears only for store keeper. Dropdown identical to the position dropdown's pattern (button + popover). |
| [src/components/staff/employee-drawer.tsx:~280](src/components/staff/employee-drawer.tsx#L280) | Header chip stack: when `type === "STORE_KEEPER" && storeKeeperSubtype`, render the subtype chip beside the type chip (using `SUBTYPE_CHIP_CLASS`). |
| [src/components/staff/employee-drawer.tsx — type-change handler](src/components/staff/employee-drawer.tsx) | When the user picks a non-store-keeper position from the dropdown, `setStoreKeeperSubtype(null)` immediately so the field doesn't ghost-persist a stale value across submits. |

### 3.4 Tests (RED first per `/tdd-orchestrator`)

**A. New unit-test file: `src/lib/db/__tests__/employees-subtype.test.ts`** — pure tests on the mapper / filter shape (no DB hit; mock `prisma.employee.findMany`).

```
describe("getEmployees with storeKeeperSubtype filter")
  ✓ returns all employees when no subtype filter
  ✓ filters by TEMPORARY
  ✓ filters by PERMANENT
  ✓ adding a subtype filter implicitly narrows type to STORE_KEEPER

describe("StaffEmployee mapper")
  ✓ propagates storeKeeperSubtype = "TEMPORARY"
  ✓ propagates storeKeeperSubtype = "PERMANENT"
  ✓ maps null subtype to null
  ✓ leaves subtype null for SUPERVISOR / ADMIN / DRIVER rows
```

**B. Extend `src/app/api/employees/__tests__/employees-route.test.ts`** (or create the file if it doesn't exist — the project has integration-style tests for other routes; mirror the pattern).

```
describe("POST /api/employees — storeKeeperSubtype")
  ✓ accepts TEMPORARY for STORE_KEEPER
  ✓ accepts PERMANENT for STORE_KEEPER
  ✓ rejects non-null subtype for SUPERVISOR / ADMIN / DRIVER (400)
  ✓ rejects invalid string (e.g. "CASUAL") with 400
  ✓ accepts null for any type

describe("PATCH /api/employees/[id] — auto-clear")
  ✓ clears subtype to null when type changes from STORE_KEEPER to ADMIN
  ✓ keeps subtype value when type stays STORE_KEEPER
  ✓ ignores subtype field for non-store-keeper updates
```

**C. (Optional) Component test** — only if Vitest + React Testing Library is set up for staff components. Not currently — skip in favor of manual QA per the project's existing convention (Phase 1 driver-position spec also opted out).

**D. No changes** to:
- [src/lib/payroll/__tests__/employee-salary-save.test.ts](src/lib/payroll/__tests__/employee-salary-save.test.ts) — pay formula unaffected.
- [src/lib/staff/__tests__/payslip-generator.test.ts](src/lib/staff/__tests__/payslip-generator.test.ts) — payslip layout unaffected.

### 3.5 Verification

- `npx tsc --noEmit` — clean for changed files (1 pre-existing parser.test.ts Buffer-cast error on main is acceptable).
- `npm run test` — all existing tests pass + new subtype tests pass.
- `npm run build` — succeeds.
- Manual QA on dev:
  1. Create new Store Keeper without subtype → form blocks with error.
  2. Create new Store Keeper with `Temporary` → row shows orange chip; drawer header shows orange chip.
  3. Edit, change subtype to `Permanent` → chip updates to emerald in row + header.
  4. Edit, change position to `Admin` → subtype dropdown disappears; on save, server stores `null`; reopening drawer with type back to `STORE_KEEPER` shows blank subtype (not the old value).
  5. Filter list by `Temporary` → only temporary store keepers visible; type filter auto-narrows to `STORE_KEEPER`.
  6. Delete employee → subtype gone with the row (cascade is implicit — column is part of the row).

---

## 4. TDD Sequence (red-green-refactor)

| Phase | Activity |
|---|---|
| **RED 1** | Add the `StaffEmployee.storeKeeperSubtype` field test in `employees-subtype.test.ts`. Fails — mapper doesn't include the field; TS rejects the literal. |
| **RED 2** | Add the API validation tests. Fail — POST/PATCH accept anything. |
| **GREEN 1** | Schema migration: add `StoreKeeperSubtype` enum + nullable column. `prisma generate` → TS knows the field. |
| **GREEN 2** | Update `getEmployees` mapper + filter — Test A passes. |
| **GREEN 3** | Add API validation + auto-clear logic in POST + PATCH — Test B passes. |
| **GREEN 4** | UI wiring: drawer dropdown + form state + validation, list filter dropdown, row chip — verified by manual QA flow above. |
| **REFACTOR** | (Optional) extract the `SUBTYPE_LABEL` / `SUBTYPE_CHIP_CLASS` constants to a shared `src/lib/staff/store-keeper-subtype.ts` if both `employee-list.tsx` and `employee-drawer.tsx` would otherwise duplicate them. Skip if shared module bloats the diff. |
| **VERIFY** | typecheck → tests → build → manual QA → commit. |

---

## 5. Risk

- **Schema migration on prod**: adding a nullable column + a new enum type is a non-breaking, online DDL on Postgres. Safe — no row rewrite, no lock escalation.
- **Type narrowing**: `EmployeeType` is unchanged, so no exhaustive `switch` regressions on the existing four-value enum. The new `StoreKeeperSubtype` enum is independent and only consumed in the new code paths added by this spec.
- **Stale subtype on type change**: the auto-clear rule in `PATCH` is the safety net. Even if the UI forgets to clear, the API guarantees `subtype = null` whenever `type ≠ STORE_KEEPER` after the update.
- **Filter UX**: the subtype filter only shows for store keepers — but it lives next to the type filter regardless. Shipping it always-visible (and dimmed when no store keeper rows exist) avoids a UI "flicker" when the user toggles the type filter. Open question §6.1.
- **Prod-only data state**: existing prod store-keeper rows will land with `subtype = null` and render a muted "Set subtype" chip. Acceptable — agents will fill them in incrementally. No bulk-edit flow.

---

## 6. Open / deferred items

1. **Subtype filter visibility** — current draft renders the filter only when `filterType` is `"STORE_KEEPER"` or `""`. Alternative: always-visible filter, dimmed when there are no store keepers in the current result set. Agent's call.
2. **Branch detail count split** — `/branches/[code]` people-at-branch card for store keepers shows total count only. Splitting into "Temporary store keepers" + "Permanent store keepers" would mean a 6th card and might unbalance the existing 5-card grid. Out of scope; tracked as a follow-up.
3. **Payslip POSITION line** — currently `STORE KEEPER`. Could become `STORE KEEPER (TEMPORARY)` if the user wants subtype to appear on payslips. Default in this spec: no — keeps Template 2 byte-for-byte stable. Trivial 2-line change in `payslip-generator.ts:60+97-102` if requested later.
4. **Default for new UI selections** — the form starts with `null` and forces a pick. Alternative: auto-select `PERMANENT` when the user picks `STORE_KEEPER` from the position dropdown. Open to either; current draft prefers explicit selection to avoid silent defaults.

---

## 7. Out of scope

- Splitting the existing `STORE_KEEPER` enum into `STORE_KEEPER_TEMPORARY` and `STORE_KEEPER_PERMANENT` — would force payroll, payslip, branch-detail, and statutory code paths to widen. Intentionally avoided.
- Bulk migration UI / one-shot script to retroactively classify existing store keepers — left to manual edit.
- Subtype-driven differences in pay model, statutory deductions, payslip template, or hourly-wage rules.
- Subtype on Dispatcher records (the user request explicitly scopes this to Store Keeper only).
- Subtype-aware reports, dashboards, or chart breakdowns on `/dashboard`.
- Subtype on combined dispatcher+employee payslips — Template 3 unaffected.
