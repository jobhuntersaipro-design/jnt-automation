import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getAgentDefaults } from "@/lib/db/staff";
import { calculateSalary } from "@/lib/upload/calculator";
import { computeEmployeeSalaryForSave } from "@/lib/payroll/employee-salary-save";
import { normalizeName } from "@/lib/dispatcher-identity/normalize-name";
import { deriveGender } from "@/lib/utils/gender";
import { buildDemoDataset, type DemoDataset } from "./dataset";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Seed the onboarding sample branch for a brand-new agent. No-op when the
 * agent already has any branch (real or demo), so it is safe to call on
 * every first-time sign-in. On any failure the partial demo is rolled back.
 */
export async function ensureDemoData(agentId: string, now = new Date()): Promise<void> {
  if ((await prisma.branch.count({ where: { agentId } })) > 0) return;
  await addDemoBranch(agentId, 0, now);
}

/**
 * Add sample branch `index` (0 = DEMO01, 1 = DEMO02, ...) with 6 months of
 * payroll. Returns false when the agent already has that branch. A failed
 * write rolls back just this branch.
 */
export async function addDemoBranch(agentId: string, index: number, now = new Date()): Promise<boolean> {
  const data = buildDemoDataset(now, index);
  let branchId: string;
  try {
    ({ id: branchId } = await prisma.branch.create({
      data: { agentId, code: data.code, isDemo: true },
      select: { id: true },
    }));
  } catch (err) {
    // Already exists (e.g. a concurrent first sign-in created it).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }

  try {
    await writeDemo(agentId, branchId, data);
  } catch (err) {
    await prisma.$transaction(deleteBranchesOps(agentId, [branchId]));
    throw err;
  }
  return true;
}

async function writeDemo(agentId: string, branchId: string, data: DemoDataset) {
  const defs = await getAgentDefaults(agentId, branchId);

  const dispatchers = await Promise.all(
    data.dispatchers.map(async (d) => {
      const petrolRule = { ...defs.petrolRule, isEligible: d.petrolEligible };
      const { id } = await prisma.dispatcher.create({
        data: {
          agentId,
          branchId,
          extId: d.extId,
          name: d.name,
          normalizedName: normalizeName(d.name),
          icNo: d.icNo,
          gender: deriveGender(d.icNo),
          assignments: { create: { branchId, extId: d.extId } },
          weightTiers: { createMany: { data: defs.weightTiers } },
          bonusTiers: { createMany: { data: defs.bonusTiers } },
          incentiveRule: { create: defs.incentiveRule },
          petrolRule: { create: petrolRule },
        },
        select: { id: true },
      });
      return { ...d, id, rules: { dispatcherId: id, extId: d.extId, ...defs, petrolRule } };
    }),
  );

  const uploads = await prisma.upload.createManyAndReturn({
    data: data.months.map(({ year, month }) => ({
      branchId,
      fileName: `${data.code} ${MONTH_ABBR[month - 1]} ${year} (sample).xlsx`,
      r2Key: "demo/sample",
      month,
      year,
      status: "SAVED" as const,
    })),
    select: { id: true, month: true, year: true },
  });
  const uploadIdFor = (year: number, month: number) =>
    uploads.find((u) => u.year === year && u.month === month)!.id;

  const results = dispatchers.flatMap((d) =>
    d.months.map((m) => {
      const r = calculateSalary(d.rules, m.rows);
      return { d, m, r, uploadId: uploadIdFor(m.year, m.month) };
    }),
  );

  const records = await prisma.salaryRecord.createManyAndReturn({
    data: results.map(({ d, m, r, uploadId }) => ({
      dispatcherId: d.id,
      uploadId,
      month: m.month,
      year: m.year,
      totalOrders: r.totalOrders,
      baseSalary: r.baseSalary,
      bonusTierEarnings: r.bonusTierEarnings,
      petrolSubsidy: r.petrolSubsidy,
      petrolQualifyingDays: r.petrolQualifyingDays,
      penalty: m.penalty,
      advance: m.advance,
      netSalary: Math.round((r.netSalary - m.penalty - m.advance) * 100) / 100,
      weightTiersSnapshot: JSON.parse(JSON.stringify(r.weightTiersSnapshot)),
      bonusTierSnapshot: JSON.parse(JSON.stringify(r.bonusTierSnapshot)),
      petrolSnapshot: JSON.parse(JSON.stringify(r.petrolSnapshot)),
    })),
    select: { id: true, dispatcherId: true, uploadId: true },
  });

  // ~60k rows: one unnest() insert is ~20× faster than chunked createMany.
  // deliveryDate is stored as UTC wall time, matching Prisma's DateTime.
  const recordIdFor = new Map(records.map((x) => [`${x.dispatcherId}:${x.uploadId}`, x.id]));
  const li = results.flatMap(({ d, r, uploadId }) => {
    const salaryRecordId = recordIdFor.get(`${d.id}:${uploadId}`)!;
    return r.lineItems.map((x) => ({ salaryRecordId, ...x }));
  });
  await prisma.$executeRaw`
    INSERT INTO "SalaryLineItem" ("id", "salaryRecordId", "waybillNumber", "weight", "commission", "deliveryDate", "isBonusTier")
    SELECT gen_random_uuid()::text, r, w, kg, c, (dt::timestamptz AT TIME ZONE 'UTC'), b
    FROM unnest(
      ${li.map((x) => x.salaryRecordId)}::text[],
      ${li.map((x) => x.waybillNumber)}::text[],
      ${li.map((x) => x.weight)}::float8[],
      ${li.map((x) => x.commission)}::float8[],
      ${li.map((x) => x.deliveryDate!.toISOString())}::text[],
      ${li.map((x) => x.isBonusTier)}::bool[]
    ) AS t(r, w, kg, c, dt, b)`;

  for (const e of data.employees) {
    const emp = await prisma.employee.create({
      data: {
        agentId,
        branchId,
        extId: e.extId,
        name: e.name,
        icNo: e.icNo,
        gender: deriveGender(e.icNo),
        type: e.type,
        subtype: e.subtype,
        basicPay: e.basicPay || null,
        hourlyWage: e.hourlyWage || null,
        petrolAllowance: e.petrolAllowance,
        kpiAllowance: e.kpiAllowance,
      },
      select: { id: true, type: true, subtype: true, name: true, branchId: true },
    });
    await prisma.employeeSalaryRecord.createMany({
      data: e.months.map((m) => ({
        employeeId: emp.id,
        month: m.month,
        year: m.year,
        ...computeEmployeeSalaryForSave(
          emp,
          {
            employeeId: emp.id,
            basicPay: e.basicPay,
            workingHours: m.workingHours,
            hourlyWage: e.hourlyWage,
            kpiAllowance: e.kpiAllowance,
            petrolAllowance: e.petrolAllowance,
            otAllowance: 0,
            otherAllowance: 0,
            pcb: 0,
            penalty: m.penalty,
            advance: m.advance,
          },
          null,
        ),
      })),
    });
  }
}

/**
 * Delete the agent's sample branch and everything hanging off it. Also marks
 * onboarding done so the demo is never re-seeded. Returns false when there
 * was nothing to remove.
 */
export async function removeDemoData(agentId: string): Promise<boolean> {
  const branches = await prisma.branch.findMany({
    where: { agentId, isDemo: true },
    select: { id: true },
  });
  const ids = branches.map((b) => b.id);
  if (ids.length === 0) return false;

  await prisma.$transaction([
    ...deleteBranchesOps(agentId, ids),
    prisma.agent.update({ where: { id: agentId }, data: { hasSeenTutorial: true } }),
  ]);
  revalidateTag("overview", { expire: 0 });
  return true;
}

function deleteBranchesOps(agentId: string, ids: string[]) {
  return [
    // SalaryRecord → Dispatcher is RESTRICT, so records go before the branch
    // cascade removes dispatchers. Line items cascade from records.
    prisma.salaryRecord.deleteMany({ where: { upload: { branchId: { in: ids } } } }),
    // Employee → Branch is SET NULL; delete explicitly (salary records cascade).
    prisma.employee.deleteMany({ where: { agentId, branchId: { in: ids } } }),
    // Cascades dispatchers (+ rules, assignments), uploads, branch defaults.
    prisma.branch.deleteMany({ where: { agentId, id: { in: ids } } }),
  ];
}
