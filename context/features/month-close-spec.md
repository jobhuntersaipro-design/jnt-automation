# Spec: Month close for multi-branch owners (v2)

Status: built and live (2026-10-09). Later phase 2 (payslips by WhatsApp link) built after it; see below. v2 only (`/app/*`); no v1 code paths change.

## Why

A real-user run of a month with two branches (PHG415, KUL4602; synthetic data) showed the flow works but
is built for one branch at a time. With six branches that is six uploads, six wizard passes, six manual
recalculates, six finalises and six payslip prints, and nothing shows the month as a whole. A new owner
who goes to Payroll first also sees RM 0.00 everywhere, because rules and vehicles come later, and the
review then offers "use your current rate card" when none exists.

## Goals

1. One screen for the month across every branch: what's in, what's missing, what's ready, done.
2. No "stale, press Recalculate" step: a draft is always worked out with today's rules.
3. Fix "no vehicle and type" without leaving the review.
4. A first-time owner can't end up with a rate card that pays nobody, or be offered a card that
   doesn't exist.

Out of scope here (later phases, below): bank payment files, payslips to riders by WhatsApp,
advances/loans, merging a transferred rider's two J&T IDs, branch-supervisor roles.

## 1. Month close (`/app/payroll`)

Payroll opens on the sidebar's month (`chosenPeriod`) instead of a flat list of runs.

**Header** — "Payroll · {month}"; primary *New payroll*; secondary *Compare with your sheet*.

**Upload several files at once** — the upload in New payroll accepts several J&T files. Each is read
in turn (one progress line per file: "PHG415_Oct.xlsx: reading…", then "PHG415 · October 2026 ready");
after the last, the owner lands on the month close screen, not a single run. One file keeps today's
flow (straight to step 2 of that run).

**Branch table** — one row per branch the account has (plus any branch a run exists for), for the month:

| Column | Shows |
|---|---|
| Branch | code; links to the run when there is one |
| J&T file | "Uploaded {date}" or "Not uploaded" (warning) |
| Penalties | "{n} cases" (success when the run's penalties are checked) or "Not imported" (warning) |
| Dispatchers | count; "{n} without vehicle and type" (warning) when any |
| Net pay | RM, from the run (draft numbers say Draft) |
| Status | Not started · Draft · Ready · Finalised |

"Ready" = draft, penalties in, nobody flagged, no unconfirmed vehicle changes. Penalties are "in" once the
branch has cases for the month (every branch has J&T penalties every month) or step 2 was confirmed, so
importing the shared penalty file once covers every branch; `finaliseRun` and the run review use the same
rule. Totals row for
dispatchers and net pay. Branch filter in the sidebar narrows the table.

**Actions**
- *Finalise ready branches ({n})* — one confirm ("Lock pay for PHG415, KUL4602? It can't change
  afterwards."), finalises each ready run; branches that aren't ready are listed with why.
- *Print payslips for the month* — all finalised runs of the month in one print view
  (`/app/payslips/month/{yyyymm}`), branch by branch, same A4 layout.
- Runs from other months: a link "Earlier months" lists them as today (month, branch, net, status).

**Empty month** — "No payroll for {month} yet" with *New payroll*.

## 2. Always up to date

- Opening a draft that is stale recalculates it first (server-side, before rendering); the info banner
  goes away. Recalculate stays as a button for "do it again".
- Saving a vehicle/type from inside the run, confirming penalties and covering the month already
  recalculate.
- The month close screen recalculates stale drafts of the month before showing numbers.

## 3. Vehicle and type inside the review

When the run has dispatchers without a vehicle and type, the review shows a card above the table:
"{n} dispatchers have no vehicle and type for {month}" with a select ("Choose vehicle and type") and
*Set for all {n} and recalculate*. Individual exceptions stay in each dispatcher's breakdown (as today)
or on Dispatchers.

## 4. First run guidance

- Creating the account's first rate card applies it to everyone from its month, so it pays someone
  without an extra step (logged as an assignment in its history). Later cards start with nobody, as
  today.
- The review's "No rate card covers {month}" alert offers *Use your current rate card from {month}* only
  when the account has a rate card; otherwise *Create a rate card* (to `/app/rules`).
- New payroll step 1 shows a warning when the account has no rate card: "You have no rate card yet.
  You can upload now, but pay will be RM 0 until you add one." with a link.

## 5. Dashboard

"Parcels" and "Dispatchers paid" count the same runs as "Net pay" (finalised and draft of the month),
and the card says "{n} finalised, {m} draft" so the numbers aren't mixed silently. Links to the month
close screen.

## Data

No schema change. Month close is read from `PayrollRun` (+ results, `penaltiesCheckedAt`),
`DispatcherProfile`, `PenaltyItem` and `Branch`, all scoped by `agentId`.

## Verification

Playwright on a synthetic two-branch account (fake R2): upload both J&T files in one go → month close
shows both drafts; import the shared penalty file once → both penalties columns fill; set vehicles from
inside one review; stale draft recalculates on open; "Finalise ready branches" finalises both; month
payslips print both branches; first rate card applies to everyone. Unit tests for the row status logic.

## Later phases (not in this spec)

1. Bank bulk-payment file (Maybank, CIMB).
2. **Built:** payslips to riders by WhatsApp link. A finalised run's *Send payslips* page
   (`/app/payroll/{runId}/send`, also linked from finalised rows in month close) lists each dispatcher with
   a mobile number (`Dispatcher.phone`, nullable, migration `20261015_v2_dispatcher_phone`), a WhatsApp
   button (wa.me with a bilingual message and the link) and *Copy link*. The link `/app/p/{resultId}.{sig}`
   opens that one payslip without signing in (HMAC with `AUTH_SECRET`, `src/lib/v2/payslip/link.ts`; only
   finalised runs; changed or made-up tokens 404); the payslip fits a phone.
   Still open: sending to everyone in one go needs the WhatsApp Business API (paid, Meta approval).
3. **Built (one-off advances):** `/app/advances` (nav *Advances*, the sidebar's month): record an advance
   (dispatcher, amount, note); it comes off that month's pay as a *Deductions · Advance* line, after every
   other line, never taking net below RM 0 (`advanceTaken`, `src/lib/v2/payroll/calc.ts`). What pay can't
   cover carries to the next month: owed = advances up to the month − advance lines of finalised earlier
   runs − advance lines of other runs that month (`advancesOwed`, `run.ts`), so nothing is stored twice.
   New table `Advance` (migration `20261016_v2_advances`). An advance can't be deleted once finalised pay
   took advances back for that dispatcher. Instalment loans: not built (asked; owner chose one-off).
4. Merge a transferred rider (two J&T IDs, one person).
5. Roles: branch supervisor prepares, owner finalises.
6. Accounting export (Bukku, SQL Account, Xero); LHDN self-billed e-Invoice if riders are contractors
   (verify against LHDN); success-rate bonus tiers; COD reconciliation; weekly pay.
