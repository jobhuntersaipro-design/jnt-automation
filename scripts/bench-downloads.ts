/**
 * Download performance benchmark — seeds a fixture on the Neon development
 * branch, runs each download-generation code path end-to-end, and writes a
 * Markdown report to `docs/perf/downloads-baseline/<YYYY-MM-DD>.md`.
 *
 * Not a Playwright E2E — this directly invokes the server-side generation
 * helpers (`generateMonthDetailFiles`, `streamZipToR2`, `generatePayslipPdf`,
 * etc.) so the numbers reflect the CPU+R2 cost without HTTP overhead. For
 * an end-user wall-clock number, add ~200ms for network RTT + middleware.
 *
 * Safety:
 * - Only writes under a dedicated `BENCH_AGENT` + `BENCH_BRANCH_CODE` — easy
 *   to clean up and never collides with real agent data.
 * - Pointed at `DATABASE_URL` (should be dev per CLAUDE.md).
 * - `--cleanup` flag deletes the fixture and exits.
 *
 * Usage:
 *   npx tsx scripts/bench-downloads.ts             # full seed + bench + report
 *   npx tsx scripts/bench-downloads.ts --cleanup   # tear down the fixture
 *
 * Tunables (env):
 *   BENCH_DISPATCHERS=50       # dispatcher count
 *   BENCH_PARCELS=200          # parcels per dispatcher per month
 *   BENCH_OUTPUT_DIR=docs/perf/downloads-baseline  # report destination
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { prisma } from "../src/lib/prisma";
import { generateMonthDetailFiles } from "../src/lib/staff/month-detail-files";
import { streamZipToR2 } from "../src/lib/staff/streaming-zip";
import { generatePayslipPdf } from "../src/lib/payroll/pdf-generator";
import { generatePayslipZip } from "../src/lib/payroll/zip-generator";

const BENCH_AGENT_EMAIL = "bench-agent@easystaff.top";
const BENCH_BRANCH_CODE = "BENCH001";
const DISPATCHERS = Number(process.env.BENCH_DISPATCHERS ?? 50);
const PARCELS_PER_DISPATCHER = Number(process.env.BENCH_PARCELS ?? 200);
const OUTPUT_DIR = process.env.BENCH_OUTPUT_DIR ?? "docs/perf/downloads-baseline";
const BENCH_YEAR = new Date().getFullYear();
const BENCH_MONTH = new Date().getMonth() + 1;

const DEFAULT_WEIGHT_TIERS = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null as number | null, commission: 2.2 },
];

interface BenchResult {
  name: string;
  totalMs: number;
  peakRssMb: number;
  outputBytes: number;
}

function peakRssMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

async function seed(): Promise<{ agentId: string; branchId: string }> {
  console.log(`[bench] seeding ${DISPATCHERS} dispatchers × ${PARCELS_PER_DISPATCHER} parcels…`);

  const agent = await prisma.agent.upsert({
    where: { email: BENCH_AGENT_EMAIL },
    update: {},
    create: {
      email: BENCH_AGENT_EMAIL,
      name: "Bench Agent",
      password: "seeded-no-login",
      isApproved: true,
      companyRegistrationNo: "BENCH-REG",
      companyAddress: "Nowhere",
    },
  });

  const branch = await prisma.branch.upsert({
    where: { agentId_code: { agentId: agent.id, code: BENCH_BRANCH_CODE } },
    update: {},
    create: { agentId: agent.id, code: BENCH_BRANCH_CODE },
  });

  // Upload row — pins the month we're benching against.
  const upload = await prisma.upload.upsert({
    where: {
      branchId_month_year: {
        branchId: branch.id,
        month: BENCH_MONTH,
        year: BENCH_YEAR,
      },
    },
    update: {},
    create: {
      branchId: branch.id,
      fileName: "bench.xlsx",
      r2Key: `bench/${randomUUID()}.xlsx`,
      month: BENCH_MONTH,
      year: BENCH_YEAR,
      status: "SAVED",
    },
  });

  // Dispatchers + SalaryRecord + line items.
  for (let i = 0; i < DISPATCHERS; i++) {
    const extId = `BENCH${String(i).padStart(4, "0")}`;
    const dispatcher = await prisma.dispatcher.upsert({
      where: { branchId_extId: { branchId: branch.id, extId } },
      update: {},
      create: {
        agentId: agent.id,
        branchId: branch.id,
        extId,
        name: `Bench Dispatcher ${i}`,
        icNo: null,
        normalizedName: `bench dispatcher ${i}`,
      },
    });

    // Reference assignment so the dispatcher surfaces under branch queries.
    await prisma.dispatcherAssignment.upsert({
      where: { branchId_extId: { branchId: branch.id, extId } },
      update: {},
      create: {
        dispatcherId: dispatcher.id,
        branchId: branch.id,
        extId,
        startedAt: new Date(BENCH_YEAR, BENCH_MONTH - 1, 1),
      },
    });

    // Weight tiers.
    for (const wt of DEFAULT_WEIGHT_TIERS) {
      await prisma.weightTier.upsert({
        where: { dispatcherId_tier: { dispatcherId: dispatcher.id, tier: wt.tier } },
        update: {},
        create: { ...wt, dispatcherId: dispatcher.id },
      });
    }

    // Salary record + line items (idempotent drop + recreate so bench runs
    // produce a consistent volume).
    await prisma.salaryRecord.deleteMany({
      where: { dispatcherId: dispatcher.id, uploadId: upload.id },
    });
    const lineItems = Array.from({ length: PARCELS_PER_DISPATCHER }, (_, j) => {
      const weight = (j % 15) + 0.1; // mix of tiers
      const tier = weight <= 5 ? 1 : weight <= 10 ? 2 : 3;
      const commission = DEFAULT_WEIGHT_TIERS[tier - 1].commission;
      return {
        waybillNumber: `WB${extId}-${j}`,
        weight,
        commission,
        isBonusTier: false,
        deliveryDate: new Date(BENCH_YEAR, BENCH_MONTH - 1, (j % 28) + 1),
      };
    });
    const totalCommission = lineItems.reduce((s, li) => s + li.commission, 0);
    await prisma.salaryRecord.create({
      data: {
        dispatcherId: dispatcher.id,
        uploadId: upload.id,
        month: BENCH_MONTH,
        year: BENCH_YEAR,
        totalOrders: PARCELS_PER_DISPATCHER,
        baseSalary: totalCommission,
        bonusTierEarnings: 0,
        commission: totalCommission,
        petrolSubsidy: 0,
        penalty: 0,
        advance: 0,
        netSalary: totalCommission,
        weightTiersSnapshot: DEFAULT_WEIGHT_TIERS,
        lineItems: { createMany: { data: lineItems } },
      },
    });

    if ((i + 1) % 10 === 0) {
      console.log(`[bench] seeded ${i + 1} / ${DISPATCHERS}`);
    }
  }

  return { agentId: agent.id, branchId: branch.id };
}

async function cleanup(): Promise<void> {
  console.log(`[bench] deleting fixture…`);
  const agent = await prisma.agent.findUnique({ where: { email: BENCH_AGENT_EMAIL } });
  if (!agent) {
    console.log("[bench] no fixture to delete");
    return;
  }
  await prisma.agent.delete({ where: { id: agent.id } });
  console.log("[bench] fixture deleted");
}

async function benchBulkMonthDetail(
  agentId: string,
  format: "csv" | "pdf",
): Promise<BenchResult> {
  const t0 = performance.now();
  let peak = peakRssMb();

  const files = await generateMonthDetailFiles({
    agentId,
    year: BENCH_YEAR,
    month: BENCH_MONTH,
    format,
    onFile: () => {
      const r = peakRssMb();
      if (r > peak) peak = r;
    },
  });

  // Stream into R2 at a throwaway key so we measure the full pipeline.
  const r2Key = `bench/${randomUUID()}.zip`;
  await streamZipToR2(r2Key, files);
  const r = peakRssMb();
  if (r > peak) peak = r;

  const totalMs = performance.now() - t0;
  // Rough ZIP size estimate = sum of file sizes (streamed ZIP doesn't
  // expose its final length without reading it back). Good enough for
  // a regression signal.
  const outputBytes = files.reduce(
    (s, f) => s + (typeof f.data === "string" ? Buffer.byteLength(f.data) : f.data.byteLength),
    0,
  );

  return {
    name: `bulk month-detail ${format.toUpperCase()} (${DISPATCHERS} × ${PARCELS_PER_DISPATCHER})`,
    totalMs,
    peakRssMb: peak,
    outputBytes,
  };
}

async function benchInlinePayslips(agentId: string): Promise<BenchResult> {
  const t0 = performance.now();
  let peak = peakRssMb();

  const records = await prisma.salaryRecord.findMany({
    where: {
      month: BENCH_MONTH,
      year: BENCH_YEAR,
      dispatcher: { branch: { agentId } },
    },
    take: 50,
    include: {
      dispatcher: { select: { name: true, extId: true, icNo: true } },
      lineItems: { select: { weight: true, commission: true, isBonusTier: true } },
    },
  });

  // Parallelized path (Phase 1) — runPool with concurrency 4.
  const { runPool } = await import("../src/lib/upload/run-pool");
  const payslips = await runPool(records, 4, async (record) => {
    const snap = (record.weightTiersSnapshot ?? []) as Array<{
      tier: number;
      minWeight: number;
      maxWeight: number | null;
      commission: number;
    }>;
    const buffer = await generatePayslipPdf({
      companyName: "Bench",
      companyRegistrationNo: null,
      companyAddress: null,
      stampImageUrl: null,
      dispatcherName: record.dispatcher.name,
      icNo: record.dispatcher.icNo ?? "",
      month: BENCH_MONTH,
      year: BENCH_YEAR,
      petrolSubsidy: record.petrolSubsidy,
      commission: record.commission,
      penalty: record.penalty,
      advance: record.advance,
      netSalary: record.netSalary,
      lineItems: record.lineItems,
      weightTiersSnapshot: snap,
      bonusTierSnapshot: [],
    });
    const r = peakRssMb();
    if (r > peak) peak = r;
    return { fileName: `${record.dispatcher.extId}.pdf`, buffer };
  });

  const zipBuffer = await generatePayslipZip(payslips);
  const totalMs = performance.now() - t0;
  return {
    name: `inline payslips ZIP (${records.length} dispatchers)`,
    totalMs,
    peakRssMb: peak,
    outputBytes: zipBuffer.byteLength,
  };
}

function renderReport(results: BenchResult[]): string {
  const ts = new Date().toISOString();
  const lines: string[] = [
    `# Download performance — baseline ${ts.slice(0, 10)}`,
    "",
    `**Fixture:** ${DISPATCHERS} dispatchers × ${PARCELS_PER_DISPATCHER} parcels/each = ${DISPATCHERS * PARCELS_PER_DISPATCHER} line items`,
    `**Timestamp:** ${ts}`,
    `**Node:** ${process.version}`,
    "",
    "| Path | Total (ms) | Peak RSS (MB) | Output (KB) |",
    "|---|---:|---:|---:|",
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.totalMs.toFixed(0)} | ${r.peakRssMb} | ${(r.outputBytes / 1024).toFixed(0)} |`,
    ),
    "",
    "Notes:",
    "- Times measured on the server side; no HTTP RTT or middleware overhead.",
    "- ZIP sizes are pre-compression for month-detail (streamed ZIP doesn't surface the final",
    "  compressed length cheaply); inline payslips ZIP is actual post-JSZip size.",
    "- Re-run after merging each phase's changes to observe deltas.",
    "",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has("--cleanup")) {
    await cleanup();
    await prisma.$disconnect();
    return;
  }

  const { agentId } = await seed();

  const results: BenchResult[] = [];
  console.log("[bench] running bulk month-detail CSV…");
  results.push(await benchBulkMonthDetail(agentId, "csv"));
  console.log("[bench] running bulk month-detail PDF…");
  results.push(await benchBulkMonthDetail(agentId, "pdf"));
  console.log("[bench] running inline payslips ZIP…");
  results.push(await benchInlinePayslips(agentId));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const fname = join(OUTPUT_DIR, `${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(fname, renderReport(results));
  console.log(`[bench] report written to ${fname}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
