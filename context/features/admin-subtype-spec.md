# Admin Subtype (Temporary / Permanent)

> Mirror the existing **Store Keeper subtype** feature (shipped 2026-05-06) onto the **Admin** position. Same enum values, same drawer dropdown, same list filter, same per-row chip, same per-month pay-mode toggle, same payslip wage-line behaviour. Schema is additive; existing rows untouched.

## Decisions (clarified before implementation)

| # | Decision |
|---|----------|
| 1 | **Temporary Admin = mirror Temporary SK pay logic exactly.** Hours × hourly wage (with HOUR/DAY payslip-label toggle). Permanent Admin keeps today's basicPay behaviour. |
| 2 | **Schema:** new `Employee.adminSubtype` column (nullable). Reuses the existing `StoreKeeperSubtype` Postgres enum (`TEMPORARY` / `PERMANENT`) — the column type is the same; only the column name differs. No enum rename, no schema-wide refactor. |
| 3 | **Branch detail counts:** keep one `Admins` tile. Subtype is a sub-tag, not a separate role — same approach as SK on `/branches/[code]`. |
| 4 | **Drawer field visibility:** unchanged. Admin keeps EPF NO + SOCSO NO fields regardless of subtype. Income Tax NO stays SK-only. |
| 5 | **Untagged Admin (`adminSubtype = null`) defaults to Permanent behaviour** (basicPay). Different from SK where untagged → Temporary; this preserves existing Admin behaviour. |
| 6 | **Payslip right-particulars** stay Admin-style (DATE / EPF NO / SOCSO NO) for both Permanent and Temporary Admin. The wage-line label is the only payslip difference. |

## Scope

### In

- `Employee.adminSubtype` column (`StoreKeeperSubtype?`).
- `src/lib/staff/admin-subtype.ts` parallel helper (`AdminSubtype` type alias, `validateAdminSubtypeForType`, `resolveAdminSubtypeUpdate`, `ADMIN_SUBTYPE_LABEL` / `ADMIN_SUBTYPE_CHIP_CLASS` / `ADMIN_SUBTYPE_VALUES`).
- Pay-logic gate `isUnitsRate` extended in 3 places (server save helper, client payroll-tab, payslip generator) to also fire when `(type === "ADMIN" && adminSubtype === "TEMPORARY")`.
- Drawer Subtype dropdown shown when type ∈ {STORE_KEEPER, ADMIN}; required for both.
- List filter "Subtype" dropdown matches by union (either `storeKeeperSubtype` or `adminSubtype`).
- Per-row chip in employee list, payroll table, and branch detail employees.
- API: POST/PATCH `/api/employees` validates `adminSubtype` against `effectiveType` and auto-clears to `null` whenever effective type leaves ADMIN.
- Payroll route GET/POST surfaces + persists `adminSubtype` on the per-month record.
- Payslip generator gates `WAGES (X HOUR/DAY)` vs `BASIC PAY` row by the unified `isUnitsRate` predicate.

### Out

- Bulk classify-existing migration UI.
- Splitting the `Admins` count tile on `/branches/[code]`.
- Driver subtype.
- Renaming `StoreKeeperSubtype` enum.
- Drawer field visibility changes (Income Tax NO stays SK-only).

## Files touched

```
prisma/schema.prisma                                            (+1 line)
prisma/migrations/20260510_add_admin_subtype/migration.sql      (new)
src/lib/staff/admin-subtype.ts                                  (new)
src/lib/staff/__tests__/admin-subtype.test.ts                   (new)
src/lib/payroll/employee-salary-save.ts                         (extend gate + EmployeeForSave)
src/lib/payroll/__tests__/employee-salary-save.test.ts          (+ tests)
src/lib/staff/payslip-generator.ts                              (extend isUnitsRate)
src/lib/staff/__tests__/payslip-generator.test.ts               (+ tests)
src/lib/db/employees.ts                                         (StaffEmployee + getEmployees)
src/lib/db/branches.ts                                          (BranchEmployeeRow)
src/app/api/employees/route.ts                                  (POST validates + persists)
src/app/api/employees/[id]/route.ts                             (PATCH validates + auto-clears + isUnitsRate gate for basicPay/hourlyWage)
src/app/api/employee-payroll/[month]/[year]/route.ts            (GET/POST surfaces + persists)
src/app/api/employee-payroll/[month]/[year]/payslip/[employeeId]/route.ts  (passes adminSubtype to generator)
src/app/api/employee-payroll/[month]/[year]/payslips/route.ts   (passes adminSubtype to generator)
src/components/staff/employee-drawer.tsx                        (subtype dropdown for ADMIN)
src/components/staff/employee-list.tsx                          (filter dropdown union, chip for ADMIN)
src/components/staff/payroll-tab.tsx                            (usesUnitsRate covers Temp Admin, sub-text chip)
src/app/(dashboard)/branches/[code]/page.tsx                    (chip for ADMIN subtype)
```

## Manual prod follow-up

Run `prisma migrate deploy` against production (or `npx prisma db execute --file=prisma/migrations/20260510_add_admin_subtype/migration.sql` with the prod URL) before users can pick a subtype on Admin in production. Until then, the drawer dropdown will reject the save server-side because the column doesn't exist. Same operational pattern as the SK subtype migration (2026-05-06) and the Driver migration (2026-04-26).
