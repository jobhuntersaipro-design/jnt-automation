# EasyStaff v2 — Design Spec

Payroll for J&T Express outlets. **An agent runs several J&T outlets and pays
the dispatchers who deliver for them.** Each month they upload the J&T delivery
Excel per outlet, import J&T HQ's QC penalty files, check every dispatcher's
pay against the pay rules, finalise, and print bilingual payslips.

This spec covers the v2 app (`/app/*`) only: screens, states, shared components
and the shape of the sample data. v1 (`src/app/(dashboard)`) is frozen and keeps
its own look, described in `context/DESIGN.md`; nothing here applies to it.
Visual language is Arc UI's free components (`src/components/arc`) re-skinned by
the EasyStaff tokens in `src/components/v2/tokens.css`. Every token named below
is a CSS variable from that file or from Arc's `foundation.css`.

Status: **v1 of this spec — 2026-10-09.** Written from the built Phases 0–5 and
the 2026-10-09 UX-review fixes. Sections marked *Proposed* are not built yet.

---

## 1. Product summary

| | |
|---|---|
| Name | EasyStaff (customers never see "v2"; URLs are `/app/*`) |
| Users | The agent's owner or office staff, one account per agent. The EasyStaff superadmin can view as an account. |
| Job | Turn a month's J&T delivery file and penalty files into correct, explainable pay per dispatcher, then payslips |
| People | **Dispatcher** everywhere in UI and code (派件员 in Chinese). Identified by J&T ID; vehicle (Bike · Car · Lorry) and type (Full-time · Part-time) set per month. |
| Places | **Outlet** in the UI (a J&T branch code such as `KUL4602`). Stored as v1's `Branch`. |
| Languages | 中文 and English, switched top right. Payslips are bilingual by default. |
| Currency | Always `RM`, 2 decimals for money, up to 4 for rates. |
| Devices | Desktop-first office tool; every screen usable at 375px with no horizontal page scroll. |

Core loop: **Pay rules → Upload delivery file → Import penalties → Review →
Finalise → Payslips.** A finalised run never changes and keeps the rule versions
it was paid with.

---

## 2. Design principles

1. **Every ringgit is explainable.** Any amount a dispatcher is paid can be
   opened down to `units × rate = amount` for the rule and tier that produced
   it. If a screen shows a total, one click shows where it came from. This is
   the product; the rest is chrome.
2. **Calm chrome, dense numbers.** Grey canvas (`--background`), white cards
   (`--surface`), `--foreground` text, never pure black. Tables and the rate
   editor carry the visual weight; headers, nav and cards stay quiet.
3. **One primary button per screen.** Arc `Button` `variant="primary"` (EasyStaff
   blue, `--accent`) for the one action that moves the month forward: *Upload
   J&T file*, *Import penalty file*, *Save version*, *Finalise payroll*.
   Everything else is `secondary` or `ghost`. `danger` only for deleting.
4. **Status is semantic, one palette, always labelled.** See §4 Status badge.
   Colour never carries meaning alone, and accent hues are not used for
   decoration.
5. **Nothing irreversible without a question.** Finalise, delete draft, archive a
   rule, replace a version, remove a penalty file, remove a stamp and changing
   the plan's outlet limit all go through `ConfirmButton` (a normal button that
   opens a dialog stating exactly what happens). The question names the thing:
   "Lock this month's pay? It can't change afterwards."
6. **Say what to do next, in words.** Errors and warnings are sentences with the
   fix in them ("No rate card covers Jan 2026 for PHG415" + one-click cover), not
   codes. A problem that blocks finalising says so and links to where it's fixed.
7. **Nothing shows a number it does not mean.** Money renders its real value on
   first paint: metric cards don't count up from zero. A headline and the table
   under it come from the same data. An empty or unset value says "Not set" or
   "None", never `0` or a pre-filled default (vehicle pickers start empty).
8. **Bilingual by construction.** Every string goes through `t()`; layouts must
   hold Chinese and English at the same size. No text baked into images, no
   widths sized to English words.
9. **Tokens only.** CSS Modules reading tokens. No Tailwind, no raw colours,
   sizes or durations in v2. Text/surface pairs clear 4.5:1 (`tokens.test.ts`).

---

## 3. Screens

Artboards at 1440 and 375 wide. Content column `--page-max-width` (90rem) with
`--page-gutter` (1rem, 2.5rem from 64rem up). Every screen except Sign-in and
Payslips shares the App Shell.

### 3.0 App shell (shared)

- **Header** — sticky, `--header-height` (4rem), `--surface` at 85% with
  `backdrop-filter: blur(12px)` so the table scrolls under it.
  Left: EasyStaff logo (links to `/app`). Middle: nav *Dashboard · Payroll ·
  Penalties · Dispatchers · Outlets · Pay rules* (plus *Design review* while the
  superadmin is viewing as an account). Right: language toggle (Arc segmented
  control, `中文 / English`, `中 / EN` under 40rem) and the account menu
  (name, *Settings*, *Sign out*).
- **Nav links** — inactive `--text-secondary`; hover `--surface-muted`; active
  (`aria-current="page"`) `--accent-subtle` background, `--accent-strong` text.
  `--duration-fast` `--ease-standard`.
- **Under 48rem** — logo and account on one row, the nav as its own
  full-width, horizontally scrollable strip beneath.
- **Viewing as** — a `--warning` banner above the header: "Viewing as
  {name}" with *Exit*. Always visible while impersonating.
- **Page header** (`ui.module.css` `.pageHeader`) — `h1` at `--text-2xl`
  Manrope 650, `--tracking-display`; subtitle `--text-secondary`, max 44rem;
  action slot right, wraps under the title on narrow screens. Detail pages put
  a `.back` link ("← Payroll") above the title.
- **Layout helpers** — `.card` (`--radius-panel`, `--surface`,
  `--shadow-resting`, `--space-6` padding), `.split` (main column + 24rem side
  column from 72rem), `.grid` (auto-fit, 22rem min), `.stack`, `.row`.

*Proposed:* a left sidebar with an outlet and month switcher, so the month
worked on stays chosen across Payroll, Penalties and Dispatchers. Until then
each screen has its own month picker defaulting to the month worked on last.

### 3.1 Sign in — `/app/login`

Centered card (26rem, `--surface`, `--radius-surface`) under a slim header with
the logo and the language toggle (the toggle works before sign-in; a Chinese
browser lands in Chinese).

- `h1` "Sign in to EasyStaff", sub "Payroll for your J&T outlets".
- Email, password (show/hide), "Forgot password?" link; primary *Sign in*
  (full width, "Signing in…" while busy).
- Divider "or", secondary *Continue with Google*.
- Errors inline above the form, `--danger`: "Invalid email or password." —
  never which one. Disabled account: "This account is disabled. Contact support
  to restore access."
- After sign-in the chosen language is saved to the profile.

### 3.2 Dashboard — `/app`

What needs doing this month, then how the month looks.

1. **Getting started** (until done) — three steps as a checklist card, each
   *Done* / *To do* with a link: *Set up your pay rules* · *Upload a J&T
   delivery file* · *Set every dispatcher's vehicle and type*.
2. **Most recent payroll: {month}** — the month worked on last (latest run by
   `updatedAt`), four metric cards: *Net pay* (RM), *Dispatchers paid* (net >
   0), *Parcels*, *Outlets finalised* "2 of 3" (out of all outlets).
3. **Needs attention** — a list, each line linking to where it's fixed:
   - "{outlet} · {month}: 4 dispatchers need attention"
   - "{outlet} · {month} is a draft: check it, then finalise"
   - "{month}: 3 penalty cases need a dispatcher"
   Empty: "Nothing needs attention." in `--text-muted`.

No charts on the dashboard yet; *Proposed:* "Net pay by month" line chart (Arc
`LineChart`, net vs parcel pay) once there are three or more finalised months.

### 3.3 Payroll — `/app/payroll`

**Header** — "Payroll", subtitle explaining the outlet and month are read from
the file. Actions: primary *Upload J&T file*, secondary *Compare with your
sheet*.

**Upload** — the header button opens the file picker, `.xlsx` only, 100 MB max
(the browser sends it straight to R2). Help: "The J&T
delivery export (.xlsx), one outlet and month per file. Uploading the same
outlet and month again replaces its draft." States:
- Uploading — Arc `Progress` with "Uploading the file".
- Working — "Reading the file and working out pay. Large files take up to a
  minute." (indeterminate).
- Done — toast "Pay worked out. Check it, then finalise." and navigate to the run.
- Errors (inline `Alert tone="danger"`): wrong type, too big, "No delivery rows
  found. Check this is the J&T delivery file (waybills in column A, dispatcher
  IDs in column M).", finalised month can't be replaced.

**Runs table** — Month · Outlet · Dispatchers · Parcels · Net pay · Status.
Status: *Draft* (neutral) or *Finalised* (success), plus "{n} need attention"
(warning) on drafts with flagged dispatchers. Row → run review.

**Empty** — Arc `EmptyState`: "No payroll yet" / "Upload a J&T delivery file to
work out a month's pay." with the upload as its action.

### 3.4 Run review — `/app/payroll/[runId]`

The screen where pay is checked and locked.

**Header** — back "Payroll"; `h1` "{outlet} · {month}"; meta line "{file} ·
worked out {when}" or "Finalised by {actor} · {when}". Actions: *Payslips*,
*Compare*, *Recalculate* (secondary), *Delete draft* (ghost, confirm), and the
primary *Finalise payroll* (confirm: "Lock this month's pay? It can't change
afterwards.").

**Alerts, top to bottom** (each only when it applies):
- **Cover** (warning) — "No rate card covers {month} for {outlet}" with one
  action "Use your current rate card from {month}" and a link "Or set it up in
  Pay rules".
- **Stale** (info) — "Rules or dispatchers changed since this was worked out.
  Recalculate to see the new pay." Finalise is disabled while stale.
- **Attention** (warning) — "4 dispatchers need attention. They aren't paid in
  full until it's fixed, and the month can't be finalised."
- **Notes** (neutral text) — rows from other outlets, other months, or with no
  date, and how each was paid.

**Metrics** — Net pay · Dispatchers · Parcels · Need attention.

**Table** (shared DataTable, §4) — Dispatcher · J&T ID · Vehicle and type ·
Parcels · Earnings · Deductions · Net · Status (*OK* success / warning text such
as "No vehicle and type for this month"). Search, sort on every column, CSV of
what's shown (money to 2 dp, totals row).

**Breakdown** — opening a dispatcher shows a wide dialog:
"{parcels} parcels · {profile}", then one block per rule:
`Tier 1 · 0–5 kg: 26 × RM 1.00 = RM 26.00`. Penalty lines list each case (date,
waybill, reason) and say "Amount from the penalty file" where no rule applies.
Totals: Earnings, Deductions, **Net pay**. A dispatcher with no vehicle/type
gets the picker in place ("Vehicle and type from {month}" → *Save and
recalculate*). Link to that dispatcher's payslip.

**Finalised** — read-only: no edit controls, *Finalised* badge, the run keeps
its numbers even if rules change later.

### 3.5 Compare with your sheet — `/app/payroll/check?month=`

Reconciles EasyStaff with the agent's own spreadsheet, for the test month and
any month after.

- **Month** picker; info alert when the month still has drafts.
- **Upload** (`.xlsx`/`.csv`) → sheet, header row, J&T ID and/or name columns,
  and *Figures to compare* (net, earnings, deductions, parcels, or any pay
  kind), each mapped to a column. Columns are guessed from English, Chinese or
  Malay headers; the user confirms.
- **Summary metrics** — Dispatchers compared · Figures that match · Differences
  to look at · Explained. Success alert when everything matches, else warning
  "{n} differences to look at".
- **Lines** — Dispatcher · J&T ID · Figure · Your sheet · EasyStaff ·
  Difference · Status (*Matches* / *Differs* / *Only in your sheet* / *Only in
  EasyStaff* / *Explained*) · Note. Differences only by default; toggle "Show
  figures that match". Opening a line: a note field and "Explained: leave it
  out". Notes survive uploading a corrected sheet.
- *Remove comparison* (confirm).

### 3.6 Penalties — `/app/penalties`

**Header** — "Penalties", subtitle; month picker; primary *Import penalty file*.

**Import** — upload `.xlsx`/`.csv` → "Check before importing": per sheet, its
detected type (or "Choose a type"), header row, column mapping (Waybill, J&T
ID, Name, Outlet, Date, Amount, Appeal, Reason, each "Not in this file" when
absent), the first cases, and *Import this sheet*. "Import into {month}" with
"Most cases in the file are from {month}." Primary "Import 10 cases". Result
toast: "{added} new, {updated} updated, {unchanged} already imported."

**Metrics** — Cases · Charged (file amounts) · Need a dispatcher · Waived.

**Need a dispatcher** (queue card, shown first when not empty) — one row per
unknown person with their case count, a dispatcher combobox ("Search by name
or ID") and *Match* / *Ignore*. Help says the choice applies to every case
naming them, now and in later files.

**By type** — Type · Cases · Need a dispatcher · Charged. Note: types with a rule
are deducted by the rule, the rest at the file's amount.

**All cases** — Date · Waybill · Type · In the file · Dispatcher · Status
(*Matched* success, *Needs a dispatcher* warning, *Ignored* / *Waived* neutral).
Case dialog: details, *Change dispatcher*, *Ignore*, *Undo*, *Waive* / *Charge
again*.

**Files imported for {month}** — "{when} · {actor} · {added} new, {updated}
updated" with *Remove* (confirm names how many cases go).

**Empty** — "No penalties for {month}" / "Import J&T HQ's QC file to deduct this
month's penalties."

### 3.7 Dispatchers — `/app/dispatchers`

**Header** — "Dispatchers", subtitle on vehicle and type deciding the rates.
Month picker ("Changes from {month}").

- Warning alert: "{n} dispatchers have no vehicle and type for {month}, so
  can't be paid yet." with a *Show: Not set* filter.
- Toolbar: search (name, ID or outlet), *Show All / Not set*, count.
- Table: checkbox · Name · Outlet · Vehicle and type (inline select; starts
  empty, "Choose vehicle and type"). Same-name dispatchers carry a warning icon:
  "Same name as another dispatcher: check it's not one person twice".
- **Bulk bar** (appears on selection): "{n} selected", vehicle and type select,
  *Apply* (disabled until a value is picked).
- Empty: "No dispatchers yet" / "They're added from the J&T delivery file when
  you run payroll."

*Proposed:* a card list instead of the table under 40rem.

### 3.8 Dispatcher detail — `/app/dispatchers/[id]`

`.split` layout. Title is the name, meta "{outlet} · {J&T ID}".
- **Pay rules** (main) — month picker; one row per kind (Rate cards, KPI, Fuel,
  SC, SC-RTN, Allowances, Deductions, one per penalty type) with the rule that
  applies and why: "{who} · from {month}", or "None".
- **Rules for this dispatcher only** — overrides with add/remove.
- **Vehicle and type** (side) — history, newest first: "From {month}: Bike ·
  Full-time", each removable; *Set to … from …* *Save*.

### 3.9 Outlets — `/app/outlets`

Card grid. Each card: outlet code (Manrope, `--text-lg`), "{n} dispatchers",
"Rules for this outlet" lines ("Rate cards: Standard bike card") or "Uses the
rules for everyone." When nothing applies: warning "No pay rules apply here yet,
so nobody is paid." with *Set up pay rules*. Header action *Add outlet*
(dialog: code, "As it appears in the J&T file, for example KUL4602"; plan limit
error points to Settings).

### 3.10 Pay rules — `/app/rules`

Grouped by kind, each group headed by the kind name and its one-line help.
Each rule row: name, kind badge (info), "From {month}", shape ("3 tiers
(marginal) · 3 weight bands · By vehicle"), and who it applies to or "Not
applied to anyone" (warning). Primary *New rule* (dialog: type, name, applies
from; starts with example numbers). Empty: "No pay rules yet" / "Start with a
rate card" → *New rate card*.

### 3.11 Rule editor — `/app/rules/[ruleId]`

The densest screen. `.split`: editor left, *Try it* / *Applies to* / *History*
right.

- **Header** — back "Pay rules"; name; *Rename*, *Copy*, *Archive* (confirm);
  *Import* / *Export*.
- **Versions** — chips by month; "Rates from {month}" with help "Changes are
  saved as a new version from the month you pick. Earlier months keep their
  numbers." Switching is blocked while there are unsaved changes.
- **Shape** — Counts (delivered / SC / SC-RTN parcels, or cases), Pays (per
  parcel / flat), *Different rate per vehicle* switch.
- **Monthly count tiers** — upper bounds only ("Up to 1,400", "1,401–2,600",
  "2,601 and above"); the last is always "and above". *Tier basis*:
  Whole / Marginal with an example sentence for each.
- **Weight bands** — same pattern in kg ("Up to 5 kg", "5.01–10 kg", "10.01 kg
  and above").
- **Rate table** — tier × band rows, one column per vehicle, `DecimalInput`
  cells right-aligned, tabular figures, up to 4 decimals.
- **Problems** — warning alert "Fix before saving" listing each issue by row.
- **Save bar** — "Save as the version from {month}", primary *Save version*,
  *Discard changes*. Replacing an existing month confirms: "Replace the {month}
  version? Unfinalised payroll from that month on will use the new numbers."
- **Try it** — sample parcels (vehicle, weight, count) → lines "26 × RM 1.00 =
  RM 26.00" and a total. Penalty rules take a number of cases.
- **Applies to** — Everyone / Full-time / Part-time / Outlet (± FT/PT only) /
  Dispatcher, from a month. Help: "The most specific match wins: a dispatcher,
  then an outlet, then full- or part-time, then everyone."
- **History** — "New rates from Oct 2026 (from rates.xlsx)" · "{actor} · {when}".

### 3.12 Settings — `/app/settings` (account menu)

Stacked cards: **Company on payslips** (name, registration no., address) ·
**Company stamp** (preview, upload/replace/remove; white made transparent) ·
**Password** (hidden for Google-only accounts) · **Plan and billing** (outlet
limit stepper, "RM {price} per outlet per month", trial/next invoice, invoices
with *Paid*/*Due*, PDF and *Pay now*). Viewing as an account shows only company
details plus an info alert explaining why.

### 3.13 Payslips — `/app/payslips/[runId]` (`?d=` for one dispatcher)

Outside the shell so only payslips print. On screen: a toolbar with "{n}
payslips", language switch (*中文 + English* · *中文* · *English*, `?lang=`),
*Print or save as PDF*; a link to Settings when company details are missing.

One A4 page per dispatcher (`@page` A4, page break per slip):
1. Company name, registration no., address; "Payslip 工资单" and the month.
2. Particulars: Name, J&T ID, Outlet, Parcels delivered, Vehicle and type.
3. **Earnings** and **Deductions** tables — Item · Qty · Rate · Amount, each
   rule's tiers and bands as lines; penalty lines with each case.
4. Totals, then **Net pay** as the largest figure on the page.
5. Stamp bottom right; "Computer-generated payslip. No signature required."
6. Drafts carry "Draft: not finalised" across the top.

Every label is 中文 then English (shown once when identical, e.g. KPI). The
saved PDF is named `<Dispatcher>_<Outlet>_<YYYY-MM>` via the page title.
Black-on-white only; nothing on the payslip depends on colour.

### 3.14 Design review — `/app/design`

Superadmin only, viewing as a v2 account. Tokens, buttons, fields, badges,
alerts, metric cards, stepper, dialogs, empty state, chart, and the payroll
table with 300 synthetic dispatchers. Any new shared component appears here
before it's used on a screen.

---

## 4. Shared components

**Buttons** — Arc `Button`: `primary` (one per screen), `secondary`, `ghost`,
`danger`. `loading` keeps the label width and disables the button; actions that
refresh a list stay busy until the list has refreshed.

**ConfirmButton** (`src/components/v2/confirm-button.tsx`) — a normal button
that opens a dialog with a question, an optional body, *Cancel* and the confirm
action (`danger` when it deletes). The only confirm pattern in v2.

**Status badge** — Arc `Badge`, colour on a tinted ground, always with its label.

| Tone | Meaning | Used for |
|---|---|---|
| `success` | Done and correct | Finalised, OK, Matched, Paid, all figures match |
| `warning` | Needs a person to act | Needs attention, Needs a dispatcher, Not applied to anyone, Due, problems before saving |
| `info` | Context, nothing broken | Rule kind, In review, Stale (recalculate), viewing-as notice |
| `neutral` | Standing state | Draft, Ignored, Waived |
| `danger` | Something failed | Errors from an action only |

A draft is neutral, not warning: being a draft is normal; what needs action is
flagged separately.

**Alert** — Arc `Alert`, same tones as badges; title is the sentence, body the
consequence, then at most one action.

**Metric card** — Arc `MetricCard`: label, value, optional caption. Money with
`RM` prefix and 2 decimals, no count-up; the value steps down a font size in
narrow cards rather than overlapping.

**Data table** (`src/components/v2/data-table`) — in-house, not Arc's.
- Toolbar: search (left, up to 24rem), count right ("32 dispatchers"), export.
- Scrolls inside its own bordered box (`--radius-panel`, max 70vh) so the
  header and first column stick; min width 56rem, the page itself never
  scrolls sideways.
- Every column sorts (`aria-sort`); numbers, money and dates first click
  descending, text ascending.
- Cells `--space-3` × `--space-4`, `--border-subtle` rule between rows, no
  zebra. Numeric cells right-aligned, `tabular-nums`. Money `RM 1,186.40`.
- Inline-editable cells are highlighted; Enter saves, Escape cancels,
  non-negative, 2 dp.
- Footer totals summed in cents. CSV: what's shown, UTF-8 BOM (Excel reads
  Chinese headers), money to 2 dp, totals row.
- Empty search: "No dispatchers match your search."
- Anything ellipsised carries a `title` with the full value.

**Month picker** — native month input styled as an Arc field (`.input`),
defaulting to the month worked on last.

**Inputs** — Arc fields with `--radius-control` (0.5rem). `DecimalInput` for
money and rates. On touch screens every input is at least 16px so iOS doesn't
zoom.

**Empty state** — Arc `EmptyState`: title says what's missing, body says how it
gets filled, one action.

**Toast** — Arc `Toast`, short past-tense confirmation ("Saved for Ahmad from
Nov 2026."). Toasts confirm; they never carry the only copy of an error.

**Motion** — Arc's `--duration-*` and `--ease-*` only. No motion on numbers or
table rows; `prefers-reduced-motion` turns transitions off.

### Tokens at a glance

| Token | Value | Use |
|---|---|---|
| `--background` | `#f6f7f9` | Page canvas |
| `--surface` | `#ffffff` | Cards, tables, dialogs |
| `--surface-muted` | `#eef0f3` | Hover, quiet panels |
| `--foreground` | `#191c1d` | Text (never `#000`) |
| `--text-secondary` / `--text-muted` | `#424654` / `#585c6b` | Subtitles, help, counts |
| `--border` / `--border-subtle` / `--border-strong` | `#e2e4e9` / `#eceef1` / `#c3c6d6` | Box, row rule, input |
| `--accent` / `--accent-strong` | `#0056d2` / `#00439f` | Primary, active nav, links |
| `--success` / `--warning` / `--danger` | `#0b7a4b` / `#8a5300` / `#b3261e` | Status text |
| `--radius-control` / `-panel` / `-surface` | 0.5 / 0.75 / 1rem | Inputs / cards / sign-in card |
| `--font-display` | Manrope + CJK fallback | Titles, big numbers |
| `--font-body` | Inter + CJK fallback | Everything else |

Breakpoints: 40rem (short labels), 48rem (nav strip), 64rem (wide gutter),
72rem (side column).

---

## 5. Sample data

Synthetic only. Never use a client's payroll sheet, penalty file, rate card or
real rates in designs, fixtures or screenshots.

- **Account** — "Demo Logistics Sdn Bhd", three outlets: `PHG415`, `PHG350`,
  `KUL4602`.
- **Dispatchers** — 32 at the main outlet, Malaysian names in mixed scripts
  ("Ahmad Faiz", "Tan Wei Ming", "Siti Nurhaliza", "Rajesh a/l Kumar"), J&T IDs
  like `PHG4150001`. Two share a name; two are new in the month with no vehicle
  and type.
- **Rate card** — illustrative numbers only: Bike 0–5 kg RM 1.00, 5.01–10 kg
  RM 1.40, 10.01 kg+ RM 2.20; KPI RM 0.10 per parcel above 1,400 (marginal);
  fuel per delivered parcel.
- **Month** — ~3,300 parcels; a few rows from another outlet, another month and
  undated, so the run notes show.
- **Penalties** — a five-sheet workbook: an English fake-attempt sheet with a
  totals row, a Chinese PDNC sheet with appeals, an outlet-named inactive
  sheet, a lost-parcel sheet without amounts, a notes sheet. One case names a
  hub ID so the queue has an entry.
- **Design review table** — 300 generated dispatchers
  (`src/components/v2/design/sample-payroll.ts`).

---

## 6. Open questions

- How the J&T file marks SC / SC-RTN parcels (the UI says it's still to be
  confirmed, in the help text and the badge tooltip).
- KPI whole vs marginal, and whether full-timers get a basic salary — both
  change what the rule editor defaults to.
- Payslip fields not stored yet: company logo, pay date, bank account; a
  company name separate from the account name; Bahasa Malaysia payslips.
- App shell with a sidebar and a persistent outlet/month switcher (§3.0).
- Dispatcher list as cards on phones (§3.7).
