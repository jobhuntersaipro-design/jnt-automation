# Spec — Staff Payroll Edit Permissions by Employee Type

> Lock down which payroll fields are editable based on employee type. Supervisor / Admin treat **Basic Pay** as the wage source (no hours). Store Keeper treats **Pay/Hour × Hours** as the wage source (no manual basic pay).

## Scope

`/staff` → Payroll tab (`src/components/staff/payroll-tab.tsx`) and the persistence path
`POST /api/employee-payroll/[month]/[year]` (`src/app/api/employee-payroll/[month]/[year]/route.ts`).

The PDF payslip generator at `src/lib/staff/payslip-generator.ts` is already row-driven
(`displayedGross = sum(addition rows)`, `displayedNet = displayedGross − sum(deductions)`)
so once the saved fields stop carrying ghost OT-hours data, the rendered TOTAL and NET will
match the saved `grossSalary` and `netSalary`. No payslip layout changes.

## Editable matrix

| Field           | Supervisor / Admin | Store Keeper          |
| --------------- | ------------------ | --------------------- |
| Basic Pay       | **editable**       | not shown (derived)   |
| Pay / Hour      | not shown          | **editable**          |
| Hours           | locked (`—`)       | **editable**          |
| Petrol          | **editable**       | **editable**          |
| KPI Bonus       | **editable**       | **editable**          |
| Other           | **editable**       | **editable**          |
| PCB             | **editable**       | **editable**          |
| Penalty         | **editable**       | **editable**          |
| EPF (employee)  | **editable**       | **editable**          |
| SOCSO (employee)| **editable**       | **editable**          |
| EIS (employee)  | **editable**       | **editable**          |
| EPF (employer)  | **editable**       | **editable**          |
| SOCSO (employer)| **editable**       | **editable**          |
| EIS (employer)  | **editable**       | **editable**          |
| Gross           | display-only       | display-only          |
| Net             | display-only       | display-only          |

Out of scope on this branch: Advance (already auto-derived from dispatcher record when matched; not in the user's editable list).

## Calculation

### Supervisor / Admin

```
gross  = basicPay + petrol + kpiBonus + other + dispatcherGross
EPF    = auto on gross (override permitted)
SOCSO  = auto on gross (override permitted)
EIS    = auto on gross (override permitted)
net    = gross − EPF(emp) − SOCSO(emp) − EIS(emp) − PCB − Penalty − Advance
```

`workingHours` and `hourlyWage` for Supervisor / Admin are **forced to 0** on save and ignored on the
client (`recalcEntry` does not read them for these types). This deletes the prior OT-hours-on-Supervisor
behavior — only the rendered display drifts back to truth on next save.

### Store Keeper

```
gross  = (workingHours × hourlyWage) + petrol + kpiBonus + other + dispatcherGross
EPF    = auto on gross (override permitted)
SOCSO  = auto on gross (override permitted)
EIS    = auto on gross (override permitted)
net    = gross − EPF(emp) − SOCSO(emp) − EIS(emp) − PCB − Penalty − Advance
```

`basicPay` is **forced to 0** on save and ignored on the client.

### Statutory recompute rule (unchanged)

- A change to a *gross-affecting* field (basicPay, hourlyWage, workingHours, petrol, KPI, other) auto-recomputes
  EPF / SOCSO / EIS from the new gross and overwrites prior manual edits. (Same rule as today.)
- A change to a stat field or PCB / Penalty only re-derives Net from the displayed values; the manual stat edit sticks.

## Existing-data behavior

When the user re-opens a previously-saved month for a Supervisor / Admin who had `workingHours > 0`
saved under the old OT feature:

- The Hours cell renders `—` regardless of the saved value.
- `recalcEntry` treats hours/hourlyWage as 0 for that type. The displayed gross / EPF / SOCSO / EIS / net
  immediately reflect the basic-pay-only formula (will differ from `saved.grossSalary` / `saved.netSalary`).
- On next **Confirm & Save**, the server forces `workingHours = 0` and `hourlyWage = 0` and writes the
  recomputed gross / statutory / net. After that save the record is fully normalized.
- No standalone migration script — the next save normalizes.

## UI changes (`payroll-tab.tsx`)

1. **Pay column** — column header changes from `Pay` to a generic `Pay` (no header text change worth fighting),
   with a per-row sub-label rendered under the input:
   - `Basic Pay` for Supervisor / Admin
   - `Pay/Hour` for Store Keeper

2. **Hours column** — render `—` (centred, muted) for Supervisor / Admin rows. Editable `HoursInput` only on
   Store Keeper rows. The conditional sub-input that today renders an hourly-wage field under the Hours cell
   when a Supervisor / Admin types hours is **deleted**.

3. **`recalcEntry`** — when `entry.type !== 'STORE_KEEPER'`, ignore `workingHours` and `hourlyWage` (treat as 0).
   For Store Keeper, behavior unchanged.

4. **`updateEntry`** — never write `workingHours` or `hourlyWage` on Sup/Admin rows; never write `basicPay` on
   Store Keeper rows. Defensive — UI no longer exposes those inputs to begin with, but the helper guards against
   bugs.

5. **Save payload** (`handleSave`) — for Sup/Admin send `workingHours: 0, hourlyWage: 0`; for Store Keeper send
   `basicPay: 0`.

6. **`allReady` gate** — Store Keeper still requires `workingHours > 0` to enable Save (unchanged). Sup/Admin
   are always considered ready (no longer conditional on hours).

## Server changes (`/api/employee-payroll/[month]/[year]` POST)

- For each entry, look up the employee type (already loaded in `employeeMap`) and call the right gross helper
  using only the fields that apply to that type:
  - `STORE_KEEPER` → `calculateStoreKeeperGross(workingHours, hourlyWage, petrol, kpi, other)`. Force
    `basicPay = 0` in the persisted columns.
  - `SUPERVISOR` / `ADMIN` → `calculateSupervisorGross(basicPay, petrol, kpi, other)` (4-arg form, omitting
    the legacy hours params). Force `workingHours = 0, hourlyWage = 0` in the persisted columns.
- Statutory override behavior unchanged: explicit values from the payload (including `0`) override the
  auto-computed amount.

## Tests (TDD)

Vitest, run via `npm run test`. Server-side / utility only — no component tests per project standards.

### `src/lib/payroll/__tests__/statutory.test.ts`

Existing `calculateSupervisorGross` cases stay (the 6-arg form is still used by Store Keeper *combined* paths
internally, but for clarity we add a coverage case for the canonical 4-arg use):

- `calculateSupervisorGross(basicPay, petrol, kpi, other)` returns `basicPay + petrol + kpi + other` (no hours).

### `src/lib/staff/__tests__/payslip-generator.test.ts` (new file)

Pure-data tests against the exported `buildAdditionRows` and `buildDeductionRows`:

1. Supervisor input with `workingHours: 0, hourlyWage: 0`:
   - additions = `[BASIC PAY, PETROL ALLOWANCE, KPI, ALLOWANCE]` (skipping zero-amount allowances).
   - sum(additions) === expected gross.
2. Store Keeper input:
   - first addition row label = `WAGES (N HOUR)` where N is `workingHours`.
   - first addition row amount === `workingHours × hourlyWage`.
3. Combined (dispatcher + supervisor):
   - additions start with tier rows, then optional bonus tiers, petrol subsidy, commission, BASIC PAY,
     allowances. No hours-derived row anywhere.
4. Combined (dispatcher + store keeper):
   - additions include WAGES row computed from `workingHours × hourlyWage`.
5. Deductions:
   - employee EPF / SOCSO / EIS / PCB rendered when > 0.
   - `data.penalty` includes dispatcher portion → split into `Penalty` (employee) + `Penalty (Dispatcher)` rows.
6. Invariant — `sum(additions) − sum(deductions)` equals the expected net for each scenario above.

### `src/app/api/employee-payroll/[month]/[year]/__tests__/route.test.ts` (new file or extension)

Skip if the existing project conventions don't already test API routes via vitest — use a thin pure-function
test instead. To keep behavior testable without DB plumbing, extract a pure helper
`computeEmployeeSalaryForSave(emp, entry, dispatcherRecord)` from the route body and unit-test it:

1. Sup/Admin entry with `workingHours: 8, hourlyWage: 50` in the payload — persisted record has
   `workingHours: 0, hourlyWage: 0` and gross excludes the OT.
2. Store Keeper entry with `basicPay: 1234` in the payload — persisted record has `basicPay: 0` and gross
   excludes it.
3. Statutory override path — explicit `epfEmployee: 0` in payload persists as `0`, not the auto-computed amount.

## Manual QA

- Open `/staff` Payroll tab as an agent who has a Sup, an Admin, and a Store Keeper, and at least one
  dispatcher-matched employee.
- Verify per-row sub-labels show `Basic Pay` and `Pay/Hour` correctly.
- Verify Hours cell on Sup/Admin shows `—` and is not interactive.
- Edit basic pay on a Sup → gross / EPF / SOCSO / EIS / Net recompute live; saved record drops any prior
  workingHours/hourlyWage to 0; payslip TOTAL == saved gross.
- Edit hours on Store Keeper → wage line, gross, statutory, net all update; payslip WAGES row matches.
- For an existing Sup/Admin record that had OT hours saved before this change, confirm that the Hours cell
  shows `—`, gross drops to basic-pay-only on screen, and Confirm & Save persists the normalized values.

## Out of scope

- No DB schema change.
- No payslip layout change.
- No UI changes to dispatcher columns or to settings tab.
- Backfill script — not needed; next save normalizes.

## Open follow-ups (post-merge)

- The `workingHours` and `hourlyWage` columns on `EmployeeSalaryRecord` will hold 0s for all Sup/Admin
  records going forward. They remain on the schema in case Store Keeper continues to use them. Drop only if
  every employee type stops using hours.
