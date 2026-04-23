import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Helpers ──────────────────────────────────────────────────

function netSalary(base: number, bonusTierEarnings: number, petrol: number, penalty = 0, advance = 0) {
  return base + bonusTierEarnings + petrol - penalty - advance;
}

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
  const password = await bcrypt.hash("YOUR_PASSWORD_HERE", 12);

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
  const dispatcherTemplates = [
    { extId: "D001", name: "Ahmad Faizal",      icNo: "900101015001", gender: "MALE"   as const, incentiveAmt: 300, petrolEligible: true  },
    { extId: "D002", name: "Nurul Aina",        icNo: "920305025002", gender: "FEMALE" as const, incentiveAmt: 280, petrolEligible: true  },
    { extId: "D003", name: "Lim Wei Hong",      icNo: "880714035003", gender: "MALE"   as const, incentiveAmt: 320, petrolEligible: false },
    { extId: "D004", name: "Siti Rahimah",      icNo: "950822045004", gender: "FEMALE" as const, incentiveAmt: 260, petrolEligible: true  },
    { extId: "D005", name: "Rajendran Pillai",  icNo: "870530055005", gender: "MALE"   as const, incentiveAmt: 300, petrolEligible: false },
    { extId: "D006", name: "Tan Mei Ling",      icNo: "910415065006", gender: "FEMALE" as const, incentiveAmt: 270, petrolEligible: true  },
  ];

  const dispatcherIds: Record<string, string> = {}; // "Kepong-D001" → prisma id

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

      const existingTiers = await prisma.weightTier.count({ where: { dispatcherId: dispatcher.id } });
      if (existingTiers === 0) await seedWeightTiers(dispatcher.id);

      await prisma.incentiveRule.upsert({
        where: { dispatcherId: dispatcher.id },
        update: {},
        create: {
          dispatcherId: dispatcher.id,
          orderThreshold: 2000,
        },
      });

      const existingBonusTiers = await prisma.bonusTier.count({
        where: { dispatcherId: dispatcher.id },
      });
      if (existingBonusTiers === 0) {
        await prisma.bonusTier.createMany({
          data: [
            { dispatcherId: dispatcher.id, tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
            { dispatcherId: dispatcher.id, tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
            { dispatcherId: dispatcher.id, tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
          ],
        });
      }

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

  const salaryByMonth: Record<number, { totalOrders: number; base: number; bonusTierEarnings: number; petrol: number; penalty: number; advance: number }[]> = {
    1: [
      { totalOrders: 2450, base: 3800, bonusTierEarnings: 300, petrol: 120, penalty: 50,  advance: 200 },
      { totalOrders: 2210, base: 3420, bonusTierEarnings: 280, petrol: 105, penalty: 0,   advance: 100 },
      { totalOrders: 1980, base: 3100, bonusTierEarnings: 320, petrol: 0,   penalty: 80,  advance: 0   },
      { totalOrders: 2050, base: 3250, bonusTierEarnings: 260, petrol: 90,  penalty: 0,   advance: 150 },
      { totalOrders: 1870, base: 2950, bonusTierEarnings: 300, petrol: 0,   penalty: 30,  advance: 0   },
      { totalOrders: 2100, base: 3300, bonusTierEarnings: 270, petrol: 75,  penalty: 0,   advance: 0   },
    ],
    2: [
      { totalOrders: 2520, base: 3920, bonusTierEarnings: 300, petrol: 135, penalty: 0,   advance: 200 },
      { totalOrders: 2280, base: 3540, bonusTierEarnings: 280, petrol: 120, penalty: 60,  advance: 0   },
      { totalOrders: 2060, base: 3210, bonusTierEarnings: 320, petrol: 0,   penalty: 0,   advance: 100 },
      { totalOrders: 2130, base: 3370, bonusTierEarnings: 260, petrol: 105, penalty: 40,  advance: 150 },
      { totalOrders: 1920, base: 3040, bonusTierEarnings: 300, petrol: 0,   penalty: 0,   advance: 0   },
      { totalOrders: 2190, base: 3430, bonusTierEarnings: 270, petrol: 90,  penalty: 25,  advance: 0   },
    ],
    3: [
      { totalOrders: 2680, base: 4120, bonusTierEarnings: 300, petrol: 150, penalty: 0,   advance: 300 },
      { totalOrders: 2410, base: 3720, bonusTierEarnings: 280, petrol: 135, penalty: 70,  advance: 0   },
      { totalOrders: 2200, base: 3430, bonusTierEarnings: 320, petrol: 0,   penalty: 0,   advance: 200 },
      { totalOrders: 2310, base: 3560, bonusTierEarnings: 260, petrol: 120, penalty: 50,  advance: 0   },
      { totalOrders: 2080, base: 3210, bonusTierEarnings: 300, petrol: 0,   penalty: 0,   advance: 100 },
      { totalOrders: 2350, base: 3640, bonusTierEarnings: 270, petrol: 105, penalty: 35,  advance: 150 },
    ],
  };

  for (const [branchLabel, branchId] of Object.entries(branches)) {
    for (const { month, year, label } of months) {
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

      const salaryData = salaryByMonth[month];

      for (let i = 0; i < dispatcherTemplates.length; i++) {
        const t = dispatcherTemplates[i];
        const dispatcherId = dispatcherIds[`${branchLabel}-${t.extId}`];
        const s = salaryData[i];
        const net = netSalary(s.base, s.bonusTierEarnings, s.petrol, s.penalty, s.advance);

        await prisma.salaryRecord.upsert({
          where: { dispatcherId_uploadId: { dispatcherId, uploadId: upload.id } },
          update: {
            totalOrders: s.totalOrders,
            baseSalary: s.base,
            bonusTierEarnings: s.bonusTierEarnings,
            petrolSubsidy: s.petrol,
            penalty: s.penalty,
            advance: s.advance,
            netSalary: net,
          },
          create: {
            dispatcherId,
            uploadId: upload.id,
            month,
            year,
            totalOrders: s.totalOrders,
            baseSalary: s.base,
            bonusTierEarnings: s.bonusTierEarnings,
            petrolSubsidy: s.petrol,
            penalty: s.penalty,
            advance: s.advance,
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
