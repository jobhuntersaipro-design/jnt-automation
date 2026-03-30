# 📦 J&T Salary Automation — Project Overview

> A web application that automates dispatcher salary calculation for a J&T Express agent operating 6 branches and 300+ dispatchers. Upload raw delivery data → get net salaries with fully customizable rules per dispatcher.

---

## 🔗 Quick Links

| Resource | Link |
|---|---|
| Raw Data Sample | [Google Sheets](https://docs.google.com/spreadsheets/d/1O8cxngSckpE9islB0oabxPtFoAbLWYiP/edit) |
| Framework | [Next.js](https://nextjs.org/docs) |
| ORM | [Prisma 7 Docs](https://www.prisma.io/docs) |
| Database | [Neon PostgreSQL](https://neon.tech/docs) |
| Auth | [NextAuth v5](https://authjs.dev/) |
| UI | [ShadCN UI](https://ui.shadcn.com/) + [Tailwind CSS](https://tailwindcss.com/docs) |
| File Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js 16 App                        │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  Pages (SSR) │   │  API Routes  │   │  Auth (NextAuth)  │  │
│  │              │   │              │   │                   │  │
│  │  /overview   │   │  /api/upload │   │  Email + Password │  │
│  │  /staff      │   │  /api/staff  │   │  Approval-gated   │  │
│  │  /payroll    │   │  /api/salary │   │  Roles: agent,    │  │
│  │  /upload     │   │  /api/export │   │  superadmin       │  │
│  │  /admin      │   │  /api/admin  │   └──────────────────┘  │
│  └──────────────┘   └──────────────┘                         │
└─────────────────────────────────────┬───────────────────────┘
                                      │
              ┌───────────────┬────────┴──────────────┐
              │               │                       │
     ┌────────▼──────┐  ┌────▼──────────┐   ┌────────▼──────┐
     │  Neon Postgres│  │ Cloudflare R2 │   │  Google Sheets│
     │  (via Prisma) │  │ (Excel files) │   │  Export API   │
     └───────────────┘  └───────────────┘   └───────────────┘
```

---

## 💰 Salary Calculation Logic

Each dispatcher's **net salary** is calculated as:

```
Net Salary = Base Salary (weight commissions)
           + Monthly Incentive (if applicable)
           + Petrol Subsidy (if eligible and threshold met)
           - Penalty (if any)
           - Advance (if any)
```

### Weight Tier Commission

Parcels are bucketed by billing weight into tiers. Each tier has a configurable **flat rate per parcel**.

**Default example tiers (all customizable per dispatcher):**

| Tier | Min Weight | Max Weight | Commission |
|------|-----------|------------|------------|
| 1 | 0 kg | 5 kg | RM 1.00 |
| 2 | 5.01 kg | 10 kg | RM 1.40 |
| 3 | 10.01 kg | ∞ | RM 2.20 |

### Monthly Incentive

- Triggered when dispatcher's **delivered orders ≥ threshold** (default: 2,000/month)
- Incentive amount is a fixed RM value, **customizable per dispatcher**

### Petrol Subsidy

- Only for **eligible dispatchers** (toggled per dispatcher)
- Triggered when dispatcher delivers **≥ threshold orders in a single day** (default: 70)
- Subsidy amount configurable per dispatcher (default: **RM15 per qualifying day**)
- Applied once per day the threshold is met

### Penalty

- Source: J&T sends penalty details to the client externally
- Manually entered per dispatcher per month — **optional**

### Advance

- Salary advance previously given to dispatcher
- Manually entered per dispatcher per month — **optional**

### Mandatory vs Optional Fields

| Field | Required before processing? |
|-------|-----------------------------|
| I/C No | ✅ Mandatory |
| Weight tiers (all 3) | ✅ Mandatory |
| Monthly incentive | ✅ Mandatory |
| Petrol subsidy | ✅ Mandatory |
| Penalty | ❌ Optional (manual, per month) |
| Advance | ❌ Optional (manual, per month) |
| SOCSO No | ❌ Blank for now |
| Income Tax No | ❌ Blank for now |
| Employer's Contribution | ❌ Blank for now |

---

## 📄 Raw Data File

**Source:** Excel file from J&T system, uploaded monthly.

**Key columns used:**

| Column | Field |
|--------|-------|
| A | Waybill Number |
| K | Branch Name (`DP Signing for Branch Name`) |
| L | Delivery Signature |
| M | Dispatcher ID |
| N | Dispatcher Name |
| Q | Billing Weight |

> Each row = one parcel delivery. Rows are aggregated per dispatcher to compute daily order counts and total weight commissions.

---

## 🗃️ Database Schema (Prisma Models)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Auth & Tenancy ───────────────────────────────────────────

// Each Agent is one paying customer (e.g. your current client, or future buyers)
model Agent {
  id           String     @id @default(cuid())
  email        String     @unique
  password     String     // bcrypt hashed
  name         String
  companyName  String?
  isApproved   Boolean    @default(false) // developer must approve after self-register
  isSuperAdmin Boolean    @default(false) // developer-only flag
  branches     Branch[]
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}

// ─── Core Domain ─────────────────────────────────────────────

model Branch {
  id          String       @id @default(cuid())
  agentId     String                        // tenant scope — branch belongs to one agent
  name        String
  dispatchers Dispatcher[]
  uploads     Upload[]
  agent       Agent        @relation(fields: [agentId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@unique([agentId, name])               // branch names unique per agent, not globally
}

model Dispatcher {
  id        String   @id @default(cuid())
  extId     String   // Dispatcher ID from raw data (col M)
  name      String
  icNo      String   // Malaysian MyKad number — mandatory. Last digit determines gender: odd = male, even = female
  gender    Gender   @default(UNKNOWN)  // derived from icNo on save
  avatarUrl String?  // Cloudflare R2 URL for uploaded avatar image
  branchId  String
  isPinned  Boolean  @default(false)
  branch    Branch   @relation(fields: [branchId], references: [id])

  // Salary rules (customizable per dispatcher)
  weightTiers    WeightTier[]
  incentiveRule  IncentiveRule?
  petrolRule     PetrolRule?

  salaryRecords SalaryRecord[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@unique([branchId, extId])            // dispatcher IDs unique per branch
}

enum Gender {
  MALE
  FEMALE
  UNKNOWN
}

// 3 weight tiers per dispatcher — defaults seeded on dispatcher creation:
// Tier 1: 0–5kg → RM1.00 | Tier 2: 5.01–10kg → RM1.40 | Tier 3: 10.01kg+ → RM2.20
model WeightTier {
  id           String     @id @default(cuid())
  dispatcherId String
  tier         Int        // 1, 2, or 3
  minWeight    Float
  maxWeight    Float?     // null = no upper bound (last tier)
  commission   Float      // RM flat rate per parcel in this tier
  dispatcher   Dispatcher @relation(fields: [dispatcherId], references: [id], onDelete: Cascade)

  @@unique([dispatcherId, tier])
}

model IncentiveRule {
  id             String     @id @default(cuid())
  dispatcherId   String     @unique
  orderThreshold Int        @default(2000) // monthly orders needed
  incentiveAmount Float     // RM reward
  dispatcher     Dispatcher @relation(fields: [dispatcherId], references: [id], onDelete: Cascade)
}

model PetrolRule {
  id             String     @id @default(cuid())
  dispatcherId   String     @unique
  isEligible     Boolean    @default(false)
  dailyThreshold Int        @default(70)   // daily orders needed (default: 70)
  subsidyAmount  Float      @default(15)   // RM per qualifying day (default: RM15)
  dispatcher     Dispatcher @relation(fields: [dispatcherId], references: [id], onDelete: Cascade)
}

// ─── Uploads & Results ───────────────────────────────────────

model Upload {
  id            String         @id @default(cuid())
  branchId      String
  fileName      String
  r2Key         String         // Cloudflare R2 object key
  month         Int            // 1–12
  year          Int
  branch        Branch         @relation(fields: [branchId], references: [id])
  salaryRecords SalaryRecord[]
  createdAt     DateTime       @default(now())

  @@unique([branchId, month, year])
}

model SalaryRecord {
  id            String  @id @default(cuid())
  dispatcherId  String
  uploadId      String
  month         Int
  year          Int

  totalOrders   Int     // total deliveries in the month
  baseSalary    Float   // sum of all weight-tier commissions
  incentive     Float   @default(0)
  petrolSubsidy Float   @default(0)
  penalty       Float   @default(0)  // manually entered from J&T penalty notice
  advance       Float   @default(0)  // salary advance deduction, manually entered
  netSalary     Float   // baseSalary + incentive + petrolSubsidy - penalty - advance

  lineItems  SalaryLineItem[] // per-parcel breakdown for GSheets export
  dispatcher Dispatcher       @relation(fields: [dispatcherId], references: [id])
  upload     Upload           @relation(fields: [uploadId], references: [id])
  createdAt  DateTime         @default(now())

  @@unique([dispatcherId, uploadId])
}

// Per-parcel breakdown stored for GSheets/PDF export
model SalaryLineItem {
  id             String       @id @default(cuid())
  salaryRecordId String
  waybillNumber  String
  weight         Float
  commission     Float
  salaryRecord   SalaryRecord @relation(fields: [salaryRecordId], references: [id], onDelete: Cascade)
}
```

---

## 📁 Project File Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── pending/page.tsx            # Shown after register, waiting for approval
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Sidebar + nav shell
│   │   ├── overview/page.tsx           # Charts, summary cards, all-time + filterable by branch/dispatcher
│   │   ├── staff/
│   │   │   ├── page.tsx                # Branch & dispatcher list
│   │   │   └── [dispatcherId]/page.tsx # Individual dispatcher settings
│   │   ├── upload/page.tsx             # Upload raw Excel file
│   │   └── payroll/page.tsx            # Monthly salary data: summary totals + orders table + export
│   ├── admin/                          # Super admin only
│   │   └── agents/page.tsx             # Approve / manage agents
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── staff/route.ts
│       ├── upload/route.ts
│       ├── salary/route.ts
│       └── export/
│           ├── gsheets/route.ts
│           └── pdf/route.ts
├── lib/
│   ├── prisma.ts                       # Prisma client singleton
│   ├── r2.ts                           # Cloudflare R2 client
│   ├── salary-calculator.ts            # Core salary logic
│   └── excel-parser.ts                 # Parse uploaded .xlsx
├── components/
│   ├── ui/                             # ShadCN components
│   ├── dispatcher-card.tsx
│   ├── weight-tier-editor.tsx
│   └── salary-table.tsx
└── prisma/
    ├── schema.prisma
    └── migrations/                     # Never use db push — migrations only
```

---

## 🚀 Features

### Overview Page

> **Route:** `/overview`

The main landing page after login. Shows all-time and filterable data across branches and dispatchers.

**Summary cards (filterable by branch and/or dispatcher):**
- Total net salary paid out
- Total base salary
- Total incentive
- Total petrol subsidy
- Total penalty
- Total advance

**Charts (TBD — suggestions: monthly payout trend, per-branch breakdown, top dispatchers by orders)**

---

### Payroll Page

> **Route:** `/payroll`

Monthly salary data. Always scoped to **one selected month** — no all-time view here.

**Summary bar** (updates with filters, always visible above the table):
- Net total salary
- Base salary
- Total incentive
- Total petrol subsidy
- Penalty (if any)
- Advance (if any)

**Filters:**
- Branch
- Dispatcher name / ID
- Month + Year *(export limited to 1 month at a time)*

**Orders table** (per dispatcher for selected month):
- Dispatcher name + avatar
- Total orders
- Base salary breakdown per weight tier
- Incentive, petrol subsidy, penalty, advance
- Net salary

**Export options:**

| Format | Detail |
|--------|--------|
| 📊 Google Sheets | One tab per dispatcher. Columns: Waybill No., Weight (sorted lowest → highest), Item Commission, Base Salary, Penalty, Petrol Subsidy, Advance, Net Total |
| 📄 PDF Invoice | One PDF per dispatcher matching invoice format, generated on-demand — **not** stored |

---

### Staff Settings Page

> **Route:** `/staff`

Manage dispatchers per branch. Each dispatcher has fully customizable salary rules.

**Per-dispatcher settings:**

| Field | Mandatory | Notes |
|-------|-----------|-------|
| I/C No | ✅ | Used to derive gender via MyKad last-digit rule |
| 3 weight tiers | ✅ | Min weight, max weight, commission per parcel |
| Monthly incentive | ✅ | Order threshold + reward amount |
| Petrol subsidy | ✅ | Eligibility toggle, daily threshold, subsidy amount |
| Avatar | ❌ | User-uploaded photo, stored in Cloudflare R2 |
| Penalty | ❌ | Manual entry per month |
| Advance | ❌ | Manual entry per month |

**Avatar & gender logic:**
- Default avatar = gender-neutral silhouette
- Gender is **auto-derived from IC number** on save — no manual gender field needed
  - Last digit odd (1,3,5,7,9) → Male → blue border on avatar
  - Last digit even (0,2,4,6,8) → Female → pink border on avatar
- User can upload a custom photo which replaces the default silhouette, but border colour still follows IC gender

**Actions:**
- 📌 Pin dispatcher to top of list
- 🔍 Search by dispatcher ID or name
- 🗑️ Delete dispatcher (with confirmation dialog)
- 💾 Auto-save on change (persisted to DB)
- 🆕 **New dispatcher detected** during upload → prompt to fill mandatory fields before processing

**Default values** are pre-filled so the user only needs to override what's different per dispatcher.

---

### Upload Page

> **Route:** `/upload`

- Accepts `.xlsx` / `.xls` only (validated on both client and server)
- File uploaded to **Cloudflare R2**; metadata + r2Key saved to DB
- System parses file, extracts dispatcher data, calculates salaries
- If a new dispatcher ID is found → user is prompted to fill mandatory fields before finalising
- Results previewed on-screen before saving to DB

---

### Other Features

- **New dispatcher detection:** Any unknown Dispatcher ID in an upload triggers a setup flow — mandatory fields (IC, weight tiers, incentive, petrol subsidy) must be filled before processing continues.
- **Pinned dispatchers:** Float to the top of the staff list for quick access.
- **Toast notifications** for all async actions (save, upload, export, delete).
- **Loading skeletons** during data fetches.

---

## 🔐 Authentication & Multi-Tenancy

Using **NextAuth v5** with email + password (bcrypt). No OAuth for now — agents register with email and are gated behind your approval.

**Roles:**

| Role | Access |
|------|--------|
| `isSuperAdmin = true` | Developer only. Can see and manage all agents and their data. |
| `isApproved = true` | Paying agent. Sees only their own branches, dispatchers, and salary records. |
| `isApproved = false` | Registered but pending. Blocked from the app until you approve. |

**Onboarding flow:**
1. Agent self-registers with email + password + company name
2. Account is created with `isApproved = false`
3. You (developer) log in as super admin and flip `isApproved = true`
4. Agent can now log in and use the app

**Data isolation:** All queries are scoped by `agentId` — an agent can never access another agent's branches, dispatchers, uploads, or salary records.

---

## ⚙️ Tech Stack Summary

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, SSR + dynamic components) |
| Language | TypeScript |
| Database | Neon PostgreSQL |
| ORM | Prisma 7 |
| Auth | NextAuth v5 (email + password, approval-gated, super admin) |
| File Storage | Cloudflare R2 |
| CSS | Tailwind CSS + ShadCN UI |
| Caching | Redis *(optional — for paginated history queries)* |

> 🚫 **Never run `prisma db push`.** All schema changes must go through versioned migrations (`prisma migrate dev` → `prisma migrate deploy`).

---

## 🎨 Design System

> Full rules in `@context/DESIGN.md`. Visual references: `@context/design-reference.html` and `@context/design-reference.png`. Match the spirit, not pixel-perfect.

### Colors & Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `surface` | #f8f9fa | Page canvas / base layer |
| `surface_container_low` | #f3f4f5 | Group related sections |
| `surface_container_lowest` | #ffffff | Cards — "pop" against base |
| `surface_container_high` | #e7e8e9 | Table row hover |
| `surface_dim` | #d9dadb | Sidebar background |
| `on_surface` | #191c1d | Primary text (never use #000000) |
| `on_surface_variant` | #424654 | Secondary / table body text |
| `primary` | #0040a1 | Main actions, avatar ring (male) |
| `primary_container` | #0056d2 | Gradient end for hero cards |
| `tertiary` | #940002 | Critical actions only (Finalize Payroll, errors), card left accent trace |
| `outline_variant` | #c3c6d6 | Ghost border at 15% opacity max |

**Rules:**
- No 1px divider lines — use background shifts to separate sections
- No pure black (#000000) — use `on_surface` (#191c1d) as darkest
- No pill shapes — `md` (0.375rem) or `lg` (0.5rem) radius only
- Currency always displayed as **RM**, never $
- Hero summary card (Total Net Payout) uses a 135° gradient from `primary` → `primary_container`
- Floating filters/nav use glassmorphism: `surface_container_lowest` at 80% opacity + `backdrop-filter: blur(12px)`

### Typography

| Role | Font | Size | Notes |
|------|------|------|-------|
| Display | Manrope | 3.5rem | High-level totals, tracking `-0.02em` |
| Headlines | Manrope | 1.5rem | Section titles, `on_surface` color |
| Body | Inter | 0.875rem | Table data, `on_surface_variant` |
| Labels | Inter | 0.75rem | Table headers, ALL CAPS, `+0.05em` tracking |

### Components

**Summary Cards**
- Background: `surface_container_lowest` (#ffffff), no border
- Radius: `xl` (0.75rem) outer, `md` (0.375rem) inner
- Left edge: 4px vertical `tertiary` (#940002) accent trace

**Tables**
- No divider lines
- Row padding: `spacing-4` (0.9rem) vertical
- Row hover: `surface_container_high` (#e7e8e9), `DEFAULT` (0.25rem) radius
- Salary column: `title-md`, `primary` color
- All numbers: tabular-numeric (monospaced) for vertical scanning

**Buttons**
- Primary: `primary` (#0040a1) bg, `md` (0.375rem) radius
- Critical/Action: `tertiary` (#940002) — Finalize Payroll, errors only

**Avatars**
- Default: gender-neutral silhouette
- Male ring: `primary` (#0040a1), 2px
- Female ring: soft rose (#f472b6), 2px
- Gender always derived from IC number — never a manual input

**Shadows**
- Modals / active states: `box-shadow: 0 12px 40px -12px rgba(25, 28, 29, 0.08)`
- Never pure black shadows

### Overview Page Layout

> Reference: `design-reference.png`

- **Top:** Page title + subtitle + Branch / Dispatcher filters + Apply button
- **Row 1:** Summary cards — Total Net Payout (gradient hero), Base Salary, Incentive, Petrol Subsidy, Penalty/Advance
- **Row 2 left:** Monthly Net Payout Trend — bar chart, 6-month view
- **Row 2 right:** Branch Distribution — horizontal bars with RM totals per branch
- **Row 3 left:** Salary Breakdown — stacked bar chart showing base salary vs incentive vs petrol subsidy vs deductions per month
- **Row 3 right:** Petrol Subsidy Eligibility Rate — % of dispatchers who hit the ≥70 daily orders threshold each month, shown as a trend line
- **Row 4 left:** Top Performing Dispatchers — avatar, name, branch, total deliveries, net salary (top 5)

---

## 🎨 UI/UX Guidelines

- **Design:** Modern, minimal — "The Precision Architect" (see Design System above)
- **Layout:** Desktop-first, mobile usable
- **Micro-interactions:** Smooth transitions, hover states on cards and rows, toast notifications for every async action, loading skeletons during data fetches
- **Spacing:** Generous — `spacing-12` (2.75rem) between major modules

---

## ✅ Confirmed Decisions

| # | Decision |
|---|---------|
| 1 | Weight tier commission is a **flat rate per parcel** (not per-kg) |
| 2 | Monthly incentive amount is a **fixed RM value, customizable per dispatcher** |
| 3 | **Multi-tenant with approval gate** — agents self-register, developer approves; super admin sees all |
| 4 | Penalties are **entered manually** by the user in the system |
| 5 | Google Sheets export uses the **Google Sheets API** (OAuth consent required once) |
| 6 | Petrol subsidy default is **RM15 per day** when dispatcher hits **≥ 70 daily orders** |
| 7 | Weight tier defaults: **0–5kg → RM1.00**, **5.01–10kg → RM1.40**, **10.01kg+ → RM2.20** |
| 8 | **I/C No** is now **mandatory** per dispatcher; gender auto-derived from 12th digit (odd=male, even=female) |
| 9 | **Advance** is a manual, optional deduction on the invoice alongside Penalty |
| 10 | PDF invoice format confirmed — addition rows show `parcels * rate` per tier. SOCSO No, Income Tax No, and Employer's Contribution left blank for now |
| 11 | Only **IC No, weight tiers, monthly incentive, and petrol subsidy** are mandatory before a dispatcher can be processed |
| 12 | Pages renamed: **Dashboard → Overview**, **History → Payroll** |
| 13 | **Overview** shows all-time filterable data with charts; **Payroll** is scoped to one month at a time with summary totals + orders table |
| 14 | Each dispatcher has an **avatar** (uploadable), with border colour derived from IC gender |
