# Seed Script — `prisma/seed.ts`

## What this seeds

- 1 superadmin Agent (norbie)
- 3 Branches: Kepong, Cheras, Puchong
- 6 Dispatchers per branch (18 total) with weight tiers, incentive rules, petrol rules
- 1 Upload per branch per month × 3 months (Jan, Feb, Mar 2026) = 9 Uploads
- 1 SalaryRecord per dispatcher per month = 54 SalaryRecords

---

## Setup

### 1. Install ts-node and bcryptjs (if not already)

```bash
npm install -D ts-node
npm install bcryptjs
npm install -D @types/bcryptjs
```

### 2. Add seed config to `package.json`

```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

### 3. Fill in your password

Replace `YOUR_PASSWORD_HERE` in the seed file before running.

### 4. Run

```bash
npx prisma db seed
```

---

## `prisma/seed.ts`

```ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────

function netSalary(base: number, incentive: number, petrol: number, penalty = 0, advance = 0) {
  return base + incentive + petrol - penalty - advance;
}

// Seed weight tiers for a dispatcher
async function seedWeightTiers(dispatcherId: string) {
  await prisma.weightTier.createMany({
    data: [
      { dispatcherId, tier: 1, minWeight: 0,     maxWeight: 5,    commission: 1.00 },
      { dispatcherId, tier: 2, minWeight: 5.01,  maxWeight: 10,   commission: 1.40 },
      { dispatcherId, tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.20 },
    ],
  });
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {

  // ── 1. Superadmin ──────────────────────────────────────────
  const password = await bcrypt.hash("1111", 12);

  const agent = await prisma.agent.upsert({
    where: { email: "jobhunters.ai.pro@gmail.com" },
    update: {},
    create: {
      email: "jobhunters.ai.pro@gmail.com",
      password,
      name: "norbie",
      isApproved: true,
      isSuperAdmin: true,
    },
  });

  console.log(`✓ Superadmin: ${agent.email}`);

  // ── 2. Branches ────────────────────────────────────────────
  const branchData = [
    { code: "KPG001", label: "Kepong"  },
    { code: "CRS001", label: "Cheras"  },
    { code: "PCH001", label: "Puchong" },
  ];

  const branches: Record<string, string> = {}; // label → id

  for (const b of branchData) {
    const branch = await prisma.branch.upsert({
      where: { agentId_code: { agentId: agent.id, code: b.code } },
      update: {},
      create: { agentId: agent.id, code: b.code },
    });
    branches[b.label] = branch.id;
    console.log(`✓ Branch: ${b.label} (${b.code})`);
  }

  // ── 3. Dispatchers ─────────────────────────────────────────
  // 6 per branch, mix of male (odd IC last digit) and female (even IC last digit)
  const dispatcherTemplates = [
    { extId: "D001", name: "Ahmad Faizal",   icNo: "900101015001", gender: "MALE"   as const, incentiveAmt: 300, petrolEligible: true  },
    { extId: "D002", name: "Nurul Aina",     icNo: "920305025002", gender: "FEMALE" as const, incentiveAmt: 280, petrolEligible: true  },
    { extId: "D003", name: "Lim Wei Hong",   icNo: "880714035003", gender: "MALE"   as const, incentiveAmt: 320, petrolEligible: false },
    { extId: "D004", name: "Siti Rahimah",   icNo: "950822045004", gender: "FEMALE" as const, incentiveAmt: 260, petrolEligible: true  },
    { extId: "D005", name: "Rajendran Pillai", icNo: "870530055005", gender: "MALE" as const, incentiveAmt: 300, petrolEligible: false },
    { extId: "D006", name: "Tan Mei Ling",   icNo: "910415065006", gender: "FEMALE" as const, incentiveAmt: 270, petrolEligible: true  },
  ];

  // dispatcher id map: "Kepong-D001" → prisma id
  const dispatcherIds: Record<string, string> = {};

  for (const [branchLabel, branchId] of Object.entries(branches)) {
    const branchPrefix = branchLabel.slice(0, 3).toUpperCase(); // KEP, CHE, PUC

    for (const t of dispatcherTemplates) {
      const extId = `${branchPrefix}-${t.extId}`;

      const dispatcher = await prisma.dispatcher.upsert({
        where: { branchId_extId: { branchId, extId } },
        update: {},
        create: {
          extId,
          name: t.name,
          icNo: t.icNo,
          gender: t.gender,
          branchId,
          isPinned: false,
        },
      });

      // Weight tiers — skip if already exist
      const existingTiers = await prisma.weightTier.count({ where: { dispatcherId: dispatcher.id } });
      if (existingTiers === 0) await seedWeightTiers(dispatcher.id);

      // Incentive rule
      await prisma.incentiveRule.upsert({
        where: { dispatcherId: dispatcher.id },
        update: {},
        create: {
          dispatcherId: dispatcher.id,
          orderThreshold: 2000,
          incentiveAmount: t.incentiveAmt,
        },
      });

      // Petrol rule
      await prisma.petrolRule.upsert({
        where: { dispatcherId: dispatcher.id },
        update: {},
        create: {
          dispatcherId: dispatcher.id,
          isEligible: t.petrolEligible,
          dailyThreshold: 70,
          subsidyAmount: 15,
        },
      });

      dispatcherIds[`${branchLabel}-${t.extId}`] = dispatcher.id;
    }

    console.log(`✓ Dispatchers seeded: ${branchLabel} (6 dispatchers)`);
  }

  // ── 4. Uploads + SalaryRecords ─────────────────────────────
  const months = [
    { month: 1, year: 2026, label: "Jan 2026" },
    { month: 2, year: 2026, label: "Feb 2026" },
    { month: 3, year: 2026, label: "Mar 2026" },
  ];

  // Realistic per-dispatcher salary figures, vary slightly per month
  const salaryByMonth: Record<number, { totalOrders: number; base: number; incentive: number; petrol: number }[]> = {
    1: [
      { totalOrders: 2450, base: 3800, incentive: 300, petrol: 120 },
      { totalOrders: 2210, base: 3420, incentive: 280, petrol: 105 },
      { totalOrders: 1980, base: 3100, incentive: 320, petrol: 0   },
      { totalOrders: 2050, base: 3250, incentive: 260, petrol: 90  },
      { totalOrders: 1870, base: 2950, incentive: 300, petrol: 0   },
      { totalOrders: 2100, base: 3300, incentive: 270, petrol: 75  },
    ],
    2: [
      { totalOrders: 2520, base: 3920, incentive: 300, petrol: 135 },
      { totalOrders: 2280, base: 3540, incentive: 280, petrol: 120 },
      { totalOrders: 2060, base: 3210, incentive: 320, petrol: 0   },
      { totalOrders: 2130, base: 3370, incentive: 260, petrol: 105 },
      { totalOrders: 1920, base: 3040, incentive: 300, petrol: 0   },
      { totalOrders: 2190, base: 3430, incentive: 270, petrol: 90  },
    ],
    3: [
      { totalOrders: 2680, base: 4120, incentive: 300, petrol: 150 },
      { totalOrders: 2410, base: 3720, incentive: 280, petrol: 135 },
      { totalOrders: 2200, base: 3430, incentive: 320, petrol: 0   },
      { totalOrders: 2310, base: 3560, incentive: 260, petrol: 120 },
      { totalOrders: 2080, base: 3210, incentive: 300, petrol: 0   },
      { totalOrders: 2350, base: 3640, incentive: 270, petrol: 105 },
    ],
  };

  for (const [branchLabel, branchId] of Object.entries(branches)) {
    for (const { month, year, label } of months) {
      // One upload per branch per month
      const upload = await prisma.upload.upsert({
        where: { branchId_month_year: { branchId, month, year } },
        update: {},
        create: {
          branchId,
          fileName: `${branchLabel.toLowerCase()}_${year}_${String(month).padStart(2, "0")}.xlsx`,
          r2Key: `uploads/${branchLabel.toLowerCase()}/${year}/${String(month).padStart(2, "0")}.xlsx`,
          month,
          year,
        },
      });

      // 6 salary records per upload
      const salaryData = salaryByMonth[month];

      for (let i = 0; i < dispatcherTemplates.length; i++) {
        const t = dispatcherTemplates[i];
        const dispatcherId = dispatcherIds[`${branchLabel}-${t.extId}`];
        const s = salaryData[i];
        const net = netSalary(s.base, s.incentive, s.petrol);

        await prisma.salaryRecord.upsert({
          where: { dispatcherId_uploadId: { dispatcherId, uploadId: upload.id } },
          update: {},
          create: {
            dispatcherId,
            uploadId: upload.id,
            month,
            year,
            totalOrders: s.totalOrders,
            baseSalary: s.base,
            incentive: s.incentive,
            petrolSubsidy: s.petrol,
            penalty: 0,
            advance: 0,
            netSalary: net,
          },
        });
      }

      console.log(`✓ Upload + SalaryRecords: ${branchLabel} — ${label}`);
    }
  }

  console.log("\n✅ Seed complete.");
  console.log("   1 superadmin | 3 branches | 18 dispatchers | 9 uploads | 54 salary records");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```
