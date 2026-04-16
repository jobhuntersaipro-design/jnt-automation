# Backlog

Features not yet specced in detail. Ordered by rough priority.
Each item will get its own spec file when it reaches the top of the queue.

---

## 1. Notifications

Wire up the notification bell in the nav bar with real data.
Currently placeholder — needs to show actual events after Upload + Payroll pages are built.

**Triggers:**
- New upload processed successfully
- Payroll confirmed for a branch + month
- New dispatcher detected during upload
- Payroll recalculated

**Notes:**
- Overview notification icon to be updated after Upload and Payroll pages are done
- Store notifications in DB per agent
- Mark as read / clear all

---

## 2. Overview — Export Performance Data

Add export buttons to the Overview page for dispatcher and branch performance data.

**Export options:**
- CSV (instant)
- Google Sheets (reuse existing OAuth flow from Payroll Phase 4)

**Format: one row per dispatcher per month** — uses snapshots from `SalaryRecord` so settings
reflect exactly what was applied that month, not current settings. If a dispatcher's incentive
changed in March, March's row shows the March snapshot value.

**Columns per row:**
- Name, Month, Branch, Total Orders, Base Salary, Incentive, Petrol Subsidy, Penalty, Advance, Net Salary
- T1 Range (e.g. "0–5kg"), T1 Rate, T2 Range (e.g. "5.01–10kg"), T2 Rate, T3 Range (e.g. "10.01kg+"), T3 Rate
- Incentive Threshold, Incentive Amount
- Petrol Eligible, Petrol Threshold, Petrol Amount

**What gets exported per branch:**
- Branch code, dispatcher count, total orders, total net payout per month

**Entry point:** Export button in Overview page header, respects current branch + date filters.

**Note:** Settings come from `SalaryRecord` snapshots — only available for confirmed months.
Dispatchers with no confirmed records for the selected period are excluded.

---

## 3. Settings Page — Profile Picture + Company Details + Member Since

Extend the existing Settings page with:

### Profile Picture
- Upload photo stored in Cloudflare R2
- Displayed in nav bar account menu (replaces initials avatar)
- Same upload pattern as dispatcher avatar

### Company Details (for payslip PDF header)
All fields optional — payslip still generates without them, just shows blank header.

- Company name
- Company registration number
- Company address (line 1 + line 2)
- Company stamp image (upload, stored in R2) — shown bottom-right of payslip

**First client stamp:** ST XIANG TRANSPORTATION SDN. BHD. circular stamp image
already provided — upload to R2 and set as `stampImageUrl` for their Agent row
via Prisma Studio when onboarding them.

**DB changes needed:**
```prisma
model Agent {
  // ... existing fields ...
  companyRegistrationNo  String?
  companyAddress         String?
  stampImageUrl          String?
}
```

### Member Since
- Show "Member since [date]" on the profile/settings page
- Derived from `Agent.createdAt`
- Display format: "Member since March 2026"

---

## 4. Auth Security Fixes

From the security audit. Implement after core features are stable.

**Critical:**
- Rate limiting on `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password` using Upstash Redis + `@upstash/ratelimit`
- bcrypt DoS guard — `password.length > 128` check before any `bcrypt.hash()` call
- Password reset race condition — use atomic `prisma.verificationToken.delete()` as validation step

**Medium:**
- Email enumeration — generic error messages on register + login
- See `auth-security-fixes-spec.md` for full details

---

## 5. Superadmin Panel (`/admin`)

Only accessible when `isSuperAdmin: true`. Hidden from regular agents.

### Agent Management
- List all registered agents with:
  - Name, email, company name
  - `isApproved` toggle (approve / revoke access)
  - `maxBranches` field (editable — default 1, set to 20 for first client)
  - Branch names (read-only list of their branches)
  - `createdAt` (member since)
- Search by name or email
- Filter by approval status

### Payment History (Manual)
- Per agent: manual payment log
- Add payment entry: date, amount (RM), notes, period covered
- List of past payment entries per agent
- No payment gateway — fully manual data entry
- DB model:
```prisma
model PaymentRecord {
  id        String   @id @default(cuid())
  agentId   String
  amount    Float
  date      DateTime
  notes     String?
  period    String?  // e.g. "March 2026 – February 2027"
  agent     Agent    @relation(fields: [agentId], references: [id])
  createdAt DateTime @default(now())
}
```

### Notes
- Superadmin can view any agent's Overview, Staff, Payroll data (read-only)
- No impersonation needed for now — just read access

---

## 6. Branch Limits

Prevent agents from creating more branches than their `maxBranches` allows.

**DB change:**
```prisma
model Agent {
  // ... existing fields ...
  maxBranches Int @default(1)
}
```

**Enforcement:**
- On branch creation → check `currentBranchCount >= agent.maxBranches`
- If at limit → block with toast: "You've reached your branch limit. Contact support to upgrade."
- Superadmin sets `maxBranches` per agent from admin panel

**First client:** Set `maxBranches = 20` via superadmin panel or seed update.

---

## 7. First-Timer Tutorial

Step-by-step tooltip overlay shown once per agent on first login.
Dismissed state stored in DB.

**Steps:**

**Overview page:**
1. Summary cards — "See your total payout, orders, and dispatcher count at a glance"
2. Charts — "Track monthly salary trends and branch performance here"
3. Date + branch filter — "Filter by branch or date range to narrow down the data"
4. Dispatcher performance table — "See individual dispatcher performance ranked by net salary"
5. Export button — "Export dispatcher performance including their salary settings to CSV or Google Sheets"

**Staff page:**
6. Dispatcher list — "All your dispatchers are listed here — search or filter by branch"
7. Defaults button — "Set default salary rules that apply to all new dispatchers automatically"
8. Pin — "Pin dispatchers that need special attention so they always appear at the top"
9. Settings drawer — "Click any dispatcher to edit their individual salary rules"
10. History tab — "View and edit past month settings per dispatcher — useful for investigating salary differences"

**Payroll page:**
11. Upload zone — "Upload your monthly J&T delivery file here to start calculating salaries"
12. Confirm settings step — "Always review staff settings before calculating — make sure rules are up to date"
13. Preview table — "Review calculated salaries and enter any penalty or advance before confirming"
14. Confirm & Save — "Once confirmed, salary records are locked and payslips can be generated"
15. Generate payslips — "Select dispatchers and download payslips as a ZIP file"
16. Edit & Recalculate — "If J&T sends penalty notices late, use this to update and regenerate"
17. Payroll history — "Access any past confirmed month here to view, export, or regenerate payslips"

**Admin panel (superadmin only):**
18. Agent list — "Approve new agents, set their branch limits, and manage access here"
19. Payment history — "Log manual payments per agent to track their subscription status"

**Implementation:**
- Use [Shepherd.js](https://shepherdjs.dev/) or build custom tooltip overlay
- `Agent.hasSeenTutorial Boolean @default(false)` — set to true on dismiss
- "Skip tutorial" option always available
- "Replay tutorial" option in Settings page
- Superadmin sees additional step 7, regular agents skip it

---

## 8. Mobile Responsiveness

Make all pages usable on mobile and tablet.

**Priority pages (most likely accessed on mobile):**
1. Payroll — upload + history list
2. Staff — dispatcher list
3. Overview — summary cards + charts

**Approach:**
- Overview charts: stack vertically on mobile, hide less important charts
- Staff table: collapse to card view on mobile (name + branch + status visible, expand for details)
- Payroll table: horizontal scroll on mobile with sticky dispatcher column
- Nav: hamburger menu on mobile
- Summary cards: 2×2 grid on mobile instead of 4 in a row

**Breakpoints:** Follow Tailwind defaults — `sm: 640px`, `md: 768px`, `lg: 1024px`

---

## 9. Payment / Access Management

> ⚠️ **Do NOT start this yet.** Handle payments manually via the Superadmin panel
> (backlog item #5) until there are enough clients to justify automation.

When ready in the future:

**Phase 1:**
- Self-service pricing page at `easystaff.top/pricing`
- Payment via BillPlz (Malaysian payment gateway) or Stripe
- On successful payment → auto-set `isApproved: true` + create `PaymentRecord`
- Webhook handler for payment confirmation

**Phase 2:**
- Subscription management — renew, cancel, upgrade branch limit
- Payment history visible to agent in their Settings page
- Auto-revoke access on subscription expiry

**Current process:** Manual approval via Superadmin panel + manual payment records.

---


---

## 10. Petrol Subsidy Days Tracking

Track and display how many days each dispatcher hit the petrol subsidy threshold.

**DB change — add to SalaryRecord:**
```prisma
model SalaryRecord {
  // ... existing fields ...
  petrolQualifyingDays Int @default(0)  // number of days >= daily threshold
}
```

**Where to show:**
- Payroll preview table — add "Petrol Days" column e.g. "8 days"
- Payroll salary table (SAVED state) — same column
- Payslip PDF — "8 qualifying days ≥ 70 orders/day" already planned

**Calculation (in pipeline.ts):**
```ts
const byDate = groupBy(deliveries, d => d.deliveryDate.toDateString());
const qualifyingDays = Object.values(byDate)
  .filter(dayItems => dayItems.length >= petrolRule.dailyThreshold).length;
```

Store `qualifyingDays` in `SalaryRecord.petrolQualifyingDays` at confirmation time.

---

## 11. Overview Dispatcher Performance — UI Updates

Updates to the Top Dispatchers table in the Overview page.

**Changes:**
- **Deductions column** — combine penalty + advance into single "Deductions" column (RM value)
- **Total Orders column** — add orders count per dispatcher
- **Export includes settings** — when exporting dispatcher performance, include weight tier rates, incentive threshold/amount, petrol settings per dispatcher (see backlog item #2)

## Status Legend

| Status | Meaning |
|---|---|
| Not started | Not yet specced or built |
| Specced | Spec file exists, not built |
| In progress | Currently being built |
| Done | Built and tested |

| # | Feature | Status |
|---|---|---|
| 1 | Notifications | Not started |
| 2 | Overview export + settings in export | Not started |
| 3 | Settings — profile pic + company details + member since | Not started |
| 4 | Auth security fixes | Specced (`auth-security-fixes-spec.md`) |
| 5 | Superadmin panel + manual payment history | Not started |
| 6 | Branch limits | Not started |
| 7 | First-timer tutorial (all pages incl. Overview + admin) | Not started |
| 8 | Mobile responsiveness | Not started |
| 9 | Payment / access management (manual only — no Stripe/BillPlz yet) | Not started |
| 10 | Petrol subsidy days tracking | Not started |
| 11 | Overview dispatcher performance UI updates | Not started |
