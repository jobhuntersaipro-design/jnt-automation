# Petrol Fixed-Total Mode

> Add an alternate calculation mode to the petrol subsidy: instead of `count(qualifying days) × per-day amount`, the user enters a single **fixed total** for the month. When fixed-total mode is active, the daily-threshold input is disabled and ignored by the calculator.

## Decisions

| # | Decision |
|---|----------|
| 1 | Schema: add `useFixedTotal: Boolean` (default `false`) + `fixedTotalAmount: Float` (default `0`) to `PetrolRule` and `AgentDefault`. Reuses the existing `isEligible` master switch — fixed-total is a **calculation mode within "eligible"**. |
| 2 | Untagged rows (existing data) → `useFixedTotal = false` → today's daily-threshold math preserved (back-compat). |
| 3 | UI: in the dispatcher row petrol section, add a 2-pill mode toggle **inside the Amount cell** (above the input): `Per Day` / `Total`. When `Total` is active, the Min Orders cell renders "—" (disabled) and the Amount input represents the total monthly RM. |
| 4 | Calculator: when `isEligible && useFixedTotal` → `petrolSubsidy = fixedTotalAmount`, `petrolQualifyingDays = 0`. Daily-threshold path unchanged otherwise. |
| 5 | Snapshot: `petrolSnapshot` JSON captures the new fields so a recalculate against an old snapshot reproduces the same number. |
| 6 | Defaults: `AgentDefault` mirrors the new fields; the defaults drawer surfaces the toggle; bulk-apply flow propagates both fields. |

## Pay model summary

```
isEligible = false             → petrolSubsidy = 0
isEligible && !useFixedTotal   → sum over days of (deliveries[day] >= dailyThreshold ? subsidyAmount : 0)
isEligible && useFixedTotal    → petrolSubsidy = fixedTotalAmount   (daily-threshold ignored)
```

## Files touched

```
prisma/schema.prisma                                      (+4 lines: 2 on PetrolRule, 2 on AgentDefault)
prisma/migrations/20260510_add_petrol_fixed_total/        (new)
src/lib/upload/calculator.ts                              (extend PetrolRuleInput + branch on useFixedTotal)
src/lib/upload/__tests__/calculator.test.ts               (+ tests)
src/lib/payroll/snapshot.ts                               (capture + diff new fields)
src/lib/db/staff.ts                                       (StaffDispatcher + getDispatchers + defaults rows)
src/lib/validations/staff.ts                              (zod petrolRuleSchema gains the two fields)
src/app/api/staff/route.ts                                (POST defaults seeding)
src/app/api/staff/[id]/settings/route.ts                  (PATCH passes new fields through)
src/app/api/staff/[id]/recalculate/route.ts               (recalc honours new snapshot fields)
src/app/api/staff/defaults/route.ts                       (GET/PUT defaults)
src/app/api/staff/apply-defaults/route.ts                 (bulk-apply propagates new fields)
src/app/api/upload/[uploadId]/setup-dispatchers/route.ts  (default seed for unknown dispatchers)
src/components/staff/dispatcher-row.tsx                   (mode toggle + cell rendering)
src/components/staff/defaults-drawer.tsx                  (mode toggle in defaults UI)
src/components/staff/history-month-row.tsx                (snapshot diff + edit UI)
src/components/payroll/new-dispatcher-modal.tsx           (if it shows petrol — confirm)
```

## Manual prod follow-up

Run `prisma migrate deploy` (or `npx prisma db execute --file=prisma/migrations/20260510_add_petrol_fixed_total/migration.sql`) against prod. Migration is **additive** — `ADD COLUMN` with defaults, no backfill, no breaking change. Existing `isEligible=true` rows continue to use daily-threshold math because `useFixedTotal` defaults to `false`.
