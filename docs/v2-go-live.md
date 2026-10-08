# EasyStaff v2: go-live runbook

How to release v2 without touching STxiang (v1), set up the first v2 client, reconcile the test
month and roll back if needed. Spec: ClickUp "SPEC: EasyStaff v2" §11 (release gates) and §12
(acceptance).

## What ships

| Area | Where |
| --- | --- |
| App version per account | `Agent.uiVersion` (V1 default). Admin → accounts table "App" column or Manage drawer. Superadmins stay on v1. |
| v2 app | `/app/*`: dashboard, payroll runs, penalties, dispatchers, outlets, pay rules, settings, payslips, comparison with the client's sheet |
| v2 API | `/api/v2/payroll/runs`, `/api/v2/payroll/check`, `/api/v2/penalties` (403 for v1 accounts and signed-out visitors) |
| Shared, reused read-only | v1's J&T streaming parser; account APIs for stamp, plan and invoices |

Migrations, all additive (new tables, enums, enum values and nullable or defaulted columns):

1. `20261008_agent_ui_version`: `Agent.uiVersion` (default V1, so every existing account stays on v1)
2. `20261008_agent_language`: `Agent.language` (nullable)
3. `20261009_v2_pay_rules`: pay rules, versions, assignments, dispatcher profiles, runs, results, audit
4. `20261010_v2_payroll_details`: run and result detail columns
5. `20261011_v2_penalties`: penalty imports, cases, aliases; `PayRuleKind.PENALTY`; `PayrollResult.penalties`
6. `20261012_v2_payroll_check`: the stored comparison with the client's sheet

The Vercel build runs `prisma migrate deploy`, so they apply on deploy. No new environment variables.

## Release gates

Do these in order. Never run tests against production itself.

### 1. Backup

1. In Neon, create a branch from production: `pre-v2-<yyyymmdd>`.
2. Check it restores: connect to the branch and count a few tables (`Agent`, `SalaryRecord`,
   `EmployeeSalaryRecord`) against production.

### 2. Golden master (v1 unchanged)

`scripts/v1-golden-master.ts` recomputes one account's month of v1 payroll from what is stored
(each salary record's parcels and the rule snapshots it kept; each staff record's inputs) with the
code in the checkout, and writes canonical JSON with a hash. It only reads.

Use a Neon branch of production (the backup branch above, or a second one), never production.
`DATABASE_URL` and `DIRECT_URL` must point at that branch.

```bash
# Before: the last commit before v2 work, in a separate worktree
git worktree add ../es-base 60df409
ln -s "$PWD/node_modules" ../es-base/node_modules
cp scripts/v1-golden-master.ts ../es-base/scripts/
(cd ../es-base && npx prisma generate && \
  npx tsx scripts/v1-golden-master.ts --agent <stxiang-email> --month <yyyy-mm> --out ../gm-before.json)

# After: the code being deployed
npx prisma generate
npx tsx scripts/v1-golden-master.ts --agent <stxiang-email> --month <yyyy-mm> --out ../gm-after.json --compare ../gm-before.json
```

Pass: `IDENTICAL`. Anything else lists the records that differ and exits non-zero: stop the
release. Use STxiang's last full month. The script also lists dispatcher records whose stored
totals differ from the recomputed ones; that's informational (old legacy-bonus snapshots), and it
must list the same records before and after.

Done locally on v1 sample data (6 dispatchers, 4 staff, Apr and Sep 2026): identical hashes between
the pre-v2 commit and this branch, and a deliberately changed figure was caught.

### 3. v1 bundle and styles

v2 styles load only from `src/app/app/layout.tsx`; `globals.css` excludes the v2 folders from
Tailwind's scan. Build the base commit and this branch and compare each v1 route's JS and CSS
(`npm run bundle-baseline` captures the sizes). To build an old commit next to this one, use a
worktree on the same disk with hard-linked modules (`cp -al node_modules ../es-base/`); Turbopack
refuses a symlinked `node_modules` outside the project.

Measured on this branch: v1 route JS within ±0.13 KB gz of the Phase 2 build, except `/admin`
(+0.85 KB: the App and language controls added there). v1 CSS is byte-identical to the build
before Phase 3; the only change since Phase 2 is the admin page's own new Tailwind classes. No v2
or Arc code in any v1 chunk.

### 4. Preview

1. Point a Vercel preview at a Neon staging branch (a branch of production).
2. Deploy the branch; the build applies the migrations to the staging branch.
3. Check STxiang's account there: login lands on v1, payroll pages unchanged.
4. Set up the v2 client there first (next section) and run the test month.

## Setting up the first v2 client

1. Admin → accounts table → **App: v2 (new payroll)** for the client's account; language 中文 in the
   Manage drawer if they want it by default.
2. **Outlets**: add the DP codes (e.g. KUL4602, SGR350, SGR470, SGR7553, SGR7555), within the
   account's outlet limit. An uploaded J&T file also creates its outlet.
3. **Pay rules**:
   - Rate cards: import each part-time card from Excel/CSV (Pay rules → New rule → Rate card →
     Import), check the preview, save from the first month, apply to the right outlets or FT/PT.
   - KPI card for full-timers: tiers 1,401–2,600 and 2,601+ (whole or marginal, as their sheet
     does it), applied to full-time.
   - Fuel: per delivered parcel, at outlet, FT/PT or dispatcher level.
   - SC and SC-RTN (RM 0 and RM 0.60 per parcel).
   - Penalties: only for types with a set amount or an escalation; other types use the amounts
     in J&T's files.
4. **Dispatchers**: upload the first J&T file (or add outlets first), then set every dispatcher's
   vehicle and full/part-time from the month (Dispatchers → filter "not set" → bulk set).
5. **Settings**: company name, registration no., address and stamp for payslips.

## Test month (acceptance: matches their sheet line by line)

1. Payroll → upload the month's J&T file per outlet. Fix anyone flagged (no vehicle/type, no
   rate card).
2. Penalties → import J&T HQ's QC files; give the unmatched cases a dispatcher or ignore them;
   recalculate the runs (they show as changed).
3. Payroll → **Compare with your sheet** → upload the client's own payroll sheet, choose the ID or
   name column and the figures (net pay, earnings, deductions, parcels, or any pay kind).
4. For each difference: fix the rule or profile if EasyStaff is wrong (then recalculate and upload
   the sheet again; notes are kept), or note why it's expected and mark it explained (e.g. a wrong
   rate in their sheet, a parcel missing from the J&T file). Export the figures as CSV for the
   record.
5. When every figure matches or is explained: finalise the runs and print the payslips
   (Payroll → run → Payslips; the browser saves them as PDF, one dispatcher per page).

## Go-live

1. Gates 1–4 passed; test month reconciled and signed off by the client.
2. Merge and deploy to production. The build applies the migrations.
3. Switch the client's production account to v2 in Admin and repeat the setup (or carry the rules
   over by importing the same rate-card files).
4. First live run: November 2026 data.

## Rollback

- **Code**: promote the previous production deployment in Vercel (instant). v2 tables stay in
  the database unused; v1 never reads them.
- **An account**: Admin → App → v1. Its v1 data was never changed; its v2 data stays for later.
- **Data**: only if something went wrong in the data itself. The migrations add and never change
  v1 tables, so this isn't expected; restore from the `pre-v2-<yyyymmdd>` branch if it is.

## Open items (need the client)

- How SC and SC-RTN parcels are marked in the J&T file (every parcel is read as normal for now).
- KPI tier basis, whole or marginal (the template is marginal).
- Whether full-timers get a basic salary on top of rates (add an ALLOWANCE rule if so).
- Real rates, and sample QC penalty files to confirm each sheet's type is detected (any sheet can
  be set by hand on import).
- Default app for new accounts: still v1. Flipping it is one additive migration
  (`ALTER TABLE "Agent" ALTER COLUMN "uiVersion" SET DEFAULT 'V2'`), but new signups also get v1's
  sample data and tour, so decide what a new v2 account should start with first.
