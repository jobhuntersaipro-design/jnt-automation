# Prisma + Neon PostgreSQL Setup

## Overview

Set up Prisma ORM with Neon PostgreSQL for the EasyStaff salary automation platform. This is the initial migration — schema will evolve as features are built.

## Requirements

- Use Neon PostgreSQL (serverless)
- Use **Prisma 7** — has breaking changes, read the upgrade guide before starting
- Create initial schema based on models below
- Include NextAuth v5 models (Account, Session, VerificationToken)
- Add indexes for all high-frequency query patterns
- Add appropriate cascade deletes
- Never use `prisma db push` — always create migrations

## References

- Data models: `@context/project-overview.md`
- Prisma 7 upgrade guide: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
- Prisma quickstart: https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/prisma-postgres
- NextAuth v5 Prisma adapter: https://authjs.dev/getting-started/adapters/prisma

## Environment

Two Neon branches:
- `DATABASE_URL` → development branch (used locally)
- `DATABASE_URL` in production env → production branch

**Never run `prisma db push`.** Always use:
```bash
# Local development
npx prisma migrate dev --name <migration-name>

# Production deployment (run before app starts)
npx prisma migrate deploy

# Check migration status before committing
npx prisma migrate status
```

---

## Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // required for Neon serverless
}

// ─── Auth & Tenancy ───────────────────────────────────────────
// NextAuth v5 required models + Agent (our tenant model)

model Agent {
  id           String    @id @default(cuid())
  email        String    @unique
  password     String?   // bcrypt hashed. Null for OAuth agents (future)
  name         String
  companyName  String?
  isApproved   Boolean   @default(false) // developer must approve after self-register
  isSuperAdmin Boolean   @default(false) // developer-only flag
  branches     Branch[]
  accounts     Account[]
  sessions     Session[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  agentId           String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  agent             Agent   @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([agentId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  agentId      String
  expires      DateTime
  agent        Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@index([agentId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ─── Core Domain ─────────────────────────────────────────────

model Branch {
  id          String       @id @default(cuid())
  agentId     String
  code        String       // raw branch code from J&T data e.g. "PHG379"
  dispatchers Dispatcher[]
  uploads     Upload[]
  agent       Agent        @relation(fields: [agentId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@unique([agentId, code])   // branch codes unique per agent
  @@index([agentId])
}

model Dispatcher {
  id        String  @id @default(cuid())
  extId     String  // Dispatcher ID from raw data (col M) e.g. "PHG3795023"
  name      String
  icNo      String  // Malaysian MyKad — mandatory. Last digit: odd = male, even = female
  gender    Gender  @default(UNKNOWN) // derived from icNo on save, never manual
  avatarUrl String? // Cloudflare R2 URL
  branchId  String
  isPinned  Boolean @default(false)

  branch        Branch         @relation(fields: [branchId], references: [id], onDelete: Cascade)
  weightTiers   WeightTier[]
  incentiveRule IncentiveRule?
  petrolRule    PetrolRule?
  salaryRecords SalaryRecord[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, extId])  // dispatcher IDs unique per branch
  @@index([branchId])          // fast lookup of all dispatchers in a branch
  @@index([extId])             // fast lookup by raw ID during upload parsing
}

enum Gender {
  MALE
  FEMALE
  UNKNOWN
}

// 3 weight tiers per dispatcher
// Defaults seeded on creation: 0–5kg→RM1.00 | 5.01–10kg→RM1.40 | 10.01kg+→RM2.20
model WeightTier {
  id           String     @id @default(cuid())
  dispatcherId String
  tier         Int        // 1, 2, or 3
  minWeight    Float
  maxWeight    Float?     // null = no upper bound (tier 3)
  commission   Float      // RM flat rate per parcel in this tier
  dispatcher   Dispatcher @relation(fields: [dispatcherId], references: [id], onDelete: Cascade)

  @@unique([dispatcherId, tier])
  @@index([dispatcherId])
}

model IncentiveRule {
  id              String     @id @default(cuid())
  dispatcherId    String     @unique
  orderThreshold  Int        @default(2000) // monthly orders needed
  incentiveAmount Float      // RM reward — no default, must be set manually
  dispatcher      Dispatcher @relation(fields: [dispatcherId], references: [id], onDelete: Cascade)
}

model PetrolRule {
  id             String     @id @default(cuid())
  dispatcherId   String     @unique
  isEligible     Boolean    @default(false)
  dailyThreshold Int        @default(70)  // daily orders needed
  subsidyAmount  Float      @default(15)  // RM per qualifying day
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
  branch        Branch         @relation(fields: [branchId], references: [id], onDelete: Cascade)
  salaryRecords SalaryRecord[]
  createdAt     DateTime       @default(now())

  @@unique([branchId, month, year])  // one upload per branch per month
  @@index([branchId])
  @@index([month, year])
}

model SalaryRecord {
  id           String @id @default(cuid())
  dispatcherId String
  uploadId     String
  month        Int
  year         Int

  totalOrders   Int   // total deliveries in the month
  baseSalary    Float // sum of all weight-tier commissions
  incentive     Float @default(0)
  petrolSubsidy Float @default(0)
  penalty       Float @default(0) // manually entered from J&T penalty notice
  advance       Float @default(0) // salary advance deduction, manually entered
  netSalary     Float // baseSalary + incentive + petrolSubsidy - penalty - advance

  lineItems  SalaryLineItem[]
  dispatcher Dispatcher       @relation(fields: [dispatcherId], references: [id])
  upload     Upload           @relation(fields: [uploadId], references: [id], onDelete: Cascade)
  createdAt  DateTime         @default(now())

  @@unique([dispatcherId, uploadId])
  @@index([dispatcherId])
  @@index([uploadId])
  @@index([month, year])              // fast Payroll page filtering by month
  @@index([dispatcherId, month, year]) // fast per-dispatcher monthly lookup
}

// Per-parcel breakdown — stored for GSheets/PDF export
model SalaryLineItem {
  id             String       @id @default(cuid())
  salaryRecordId String
  waybillNumber  String
  weight         Float
  commission     Float
  deliveryDate   DateTime?    // date of delivery — used for daily order counts (petrol subsidy)
  salaryRecord   SalaryRecord @relation(fields: [salaryRecordId], references: [id], onDelete: Cascade)

  @@index([salaryRecordId])
}
```

---

## Notes

### Branch code
`Branch` uses only the raw `code` from J&T data (e.g. `PHG379`). This is populated automatically from the uploaded Excel file. The UI displays the code directly everywhere.

### NextAuth adapter
NextAuth v5 Prisma adapter expects `userId` on Account and Session — but since our user model is called `Agent`, use `agentId` instead and configure the adapter accordingly in `src/lib/auth.ts`.

### deliveryDate on SalaryLineItem
Added `deliveryDate` to `SalaryLineItem` — this is needed to calculate petrol subsidy correctly. The subsidy is triggered per day where a dispatcher delivers ≥70 orders, so we need to group line items by date. Map this from the delivery date column in the raw Excel file.

### Seeding weight tiers
When a new `Dispatcher` is created, immediately seed 3 `WeightTier` rows with the default values in a single transaction:
```ts
await prisma.$transaction([
  prisma.dispatcher.create({ data: { ...dispatcherData } }),
  prisma.weightTier.createMany({
    data: [
      { dispatcherId, tier: 1, minWeight: 0, maxWeight: 5, commission: 1.00 },
      { dispatcherId, tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.40 },
      { dispatcherId, tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.20 },
    ]
  })
])
```

### DIRECT_URL for Neon
Neon requires both `DATABASE_URL` (pooled connection) and `DIRECT_URL` (direct connection for migrations). Add both to `.env`:
```env
DATABASE_URL="postgresql://..."       # pooled — used by Prisma client at runtime
DIRECT_URL="postgresql://..."         # direct — used by Prisma migrate
```
