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