/**
 * v1 golden master (release gate, EasyStaff v2 spec §11): recomputes one account's month of v1
 * payroll from what is stored, with the code in this checkout, and writes it as canonical JSON
 * with a hash. Dispatchers: each salary record's parcels (line items) and the rule snapshots it
 * kept, through v1's calculateSalary. Staff: each salary record's inputs through
 * computeEmployeeSalaryForSave (statutory worked out, not the stored overrides).
 *
 * Run it on a Neon branch of production, never production itself, with the code before a deploy
 * and again with the code being deployed: the hashes must match. It only reads.
 * It also reports dispatcher records whose stored totals differ from the recomputed ones.
 *
 * Usage:
 *   npx tsx scripts/v1-golden-master.ts --agent <email> --month 2026-09 --out gm-before.json
 *   npx tsx scripts/v1-golden-master.ts --agent <email> --month 2026-09 --out gm-after.json --compare gm-before.json
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { computeEmployeeSalaryForSave } from "../src/lib/payroll/employee-salary-save";
import { readBonusTierSnapshot } from "../src/lib/staff/bonus-tier-snapshot";
import { calculateSalary, type PetrolRuleInput, type WeightTierInput } from "../src/lib/upload/calculator";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function dispatchers(agentId: string, year: number, month: number) {
  const records = await prisma.salaryRecord.findMany({
    where: { year, month, upload: { branch: { agentId } } },
    include: { lineItems: true, upload: { select: { branch: { select: { code: true } } } }, dispatcher: { select: { extId: true, name: true } } },
  });
  const out: Record<string, unknown> = {};
  const storedDiffs: string[] = [];
  for (const r of records) {
    const key = `${r.upload.branch.code}/${r.dispatcher.extId}`;
    const bonus = readBonusTierSnapshot(r.bonusTierSnapshot);
    const result = calculateSalary(
      {
        dispatcherId: r.dispatcherId,
        extId: r.dispatcher.extId,
        weightTiers: (r.weightTiersSnapshot ?? []) as unknown as WeightTierInput[],
        incentiveRule: { orderThreshold: bonus?.orderThreshold ?? 0 },
        bonusTiers: bonus?.tiers ?? [],
        petrolRule: (r.petrolSnapshot ?? { isEligible: false, dailyThreshold: 0, subsidyAmount: 0 }) as unknown as PetrolRuleInput,
      },
      r.lineItems.map((li) => ({
        waybillNumber: li.waybillNumber,
        billingWeight: li.weight,
        deliveryDate: li.deliveryDate,
        branchName: r.upload.branch.code,
        dispatcherId: r.dispatcher.extId,
        dispatcherName: r.dispatcher.name,
      })),
    );
    // Manual amounts (commission, penalty, advance) are inputs: added back as v1 does on save.
    const net = round2(result.baseSalary + result.bonusTierEarnings + result.petrolSubsidy + r.commission - r.penalty - r.advance);
    const computed = {
      totalOrders: result.totalOrders,
      baseSalary: result.baseSalary,
      bonusTierEarnings: result.bonusTierEarnings,
      petrolSubsidy: result.petrolSubsidy,
      petrolQualifyingDays: result.petrolQualifyingDays,
      netSalary: net,
      lines: result.lineItems.map((li) => [li.waybillNumber, li.weight, li.commission, li.isBonusTier]),
    };
    out[key] = computed;
    const stored = { totalOrders: r.totalOrders, baseSalary: r.baseSalary, bonusTierEarnings: r.bonusTierEarnings, petrolSubsidy: r.petrolSubsidy, petrolQualifyingDays: r.petrolQualifyingDays, netSalary: r.netSalary };
    const differs = (Object.keys(stored) as (keyof typeof stored)[]).filter((k) => Math.abs(Number(stored[k]) - Number(computed[k])) > 0.005);
    if (differs.length > 0) storedDiffs.push(`${key}: ${differs.map((k) => `${k} stored ${stored[k]} vs ${computed[k]}`).join(", ")}${bonus?.legacyAmount != null ? " (legacy bonus snapshot)" : ""}`);
  }
  return { out, storedDiffs };
}

async function staff(agentId: string, year: number, month: number) {
  const records = await prisma.employeeSalaryRecord.findMany({ where: { year, month, employee: { agentId } }, include: { employee: true } });
  const out: Record<string, unknown> = {};
  for (const r of records) {
    const e = r.employee;
    const linked = e.dispatcherId ? await prisma.salaryRecord.findFirst({ where: { dispatcherId: e.dispatcherId, year, month } }) : null;
    const result = computeEmployeeSalaryForSave(
      { id: e.id, type: e.type, subtype: e.subtype, name: e.name, branchId: e.branchId },
      {
        employeeId: e.id,
        basicPay: r.basicPay,
        workingHours: r.workingHours,
        hourlyWage: r.hourlyWage,
        payMode: r.payMode,
        kpiAllowance: r.kpiAllowance,
        petrolAllowance: r.petrolAllowance,
        otAllowance: r.otAllowance,
        otherAllowance: r.otherAllowance,
        pcb: r.pcb,
        penalty: r.penalty,
        advance: r.advance,
      },
      linked ? { baseSalary: linked.baseSalary, bonusTierEarnings: linked.bonusTierEarnings, petrolSubsidy: linked.petrolSubsidy, penalty: linked.penalty, advance: linked.advance } : null,
    );
    out[`${e.extId ?? ""}/${e.name}/${e.id}`] = result;
  }
  return out;
}

/** JSON with keys sorted at every level, so the same results always give the same text. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical((value as Record<string, unknown>)[k])]));
  }
  return value;
}

async function main() {
  const email = arg("agent");
  const monthArg = arg("month");
  const outPath = arg("out");
  if (!email || !monthArg || !/^\d{4}-\d{2}$/.test(monthArg) || !outPath) {
    console.error("Usage: npx tsx scripts/v1-golden-master.ts --agent <email> --month YYYY-MM --out <file> [--compare <file>]");
    process.exit(2);
  }
  const [year, month] = monthArg.split("-").map(Number);
  const agent = await prisma.agent.findUnique({ where: { email }, select: { id: true } });
  if (!agent) throw new Error(`No account ${email}`);

  const d = await dispatchers(agent.id, year, month);
  const results = canonical({ dispatchers: d.out, staff: await staff(agent.id, year, month) });
  const text = JSON.stringify(results);
  const hash = createHash("sha256").update(text).digest("hex");
  await writeFile(outPath, JSON.stringify({ agent: email, month: monthArg, hash, results }, null, 1));
  console.log(`${Object.keys(d.out).length} dispatcher records, ${Object.keys((results as { staff: object }).staff).length} staff records`);
  console.log(`hash ${hash} -> ${outPath}`);
  if (d.storedDiffs.length > 0) {
    console.log(`${d.storedDiffs.length} dispatcher records differ from what is stored (expected only for legacy snapshots):`);
    for (const line of d.storedDiffs.slice(0, 20)) console.log(`  ${line}`);
  }

  const comparePath = arg("compare");
  if (comparePath) {
    const before = JSON.parse(await readFile(comparePath, "utf8")) as { hash: string; results: { dispatchers: Record<string, unknown>; staff: Record<string, unknown> } };
    if (before.hash === hash) {
      console.log("IDENTICAL to", comparePath);
      return;
    }
    const after = results as typeof before.results;
    const changed: string[] = [];
    for (const group of ["dispatchers", "staff"] as const) {
      const keys = new Set([...Object.keys(before.results[group]), ...Object.keys(after[group])]);
      for (const k of keys) if (JSON.stringify(before.results[group][k]) !== JSON.stringify(after[group][k])) changed.push(`${group} ${k}`);
    }
    console.log(`DIFFERENT from ${comparePath}: ${changed.length} records`);
    for (const k of changed.slice(0, 30)) console.log(`  ${k}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
