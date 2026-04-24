/**
 * Measures PDF download cost for a dispatcher's month detail ("line items"),
 * breaking down the two code paths that GET /api/staff/[id]/history/[sid]/export/pdf uses:
 *
 *   MISS: DB fetch → PDF generation → stream back; async write-through to R2.
 *   HIT : HEAD to R2 → presign → 302 → browser pulls bytes from R2 directly.
 *
 * For each sample we measure:
 *   - getMonthDetail wall time
 *   - generateMonthDetailPdf wall time
 *   - R2 PUT (write-through, async in prod)
 *   - R2 HEAD (cache-hit check)
 *   - Presign URL generation
 *   - R2 GET (client-perceived byte transfer, both paths)
 *
 * Seeds a dedicated `bench-pdf-agent@easystaff.top` with 4 dispatchers at
 * different parcel volumes (50 / 500 / 2000 / 8000) so we can see how
 * generation scales. All bench data is cleaned up at the end.
 *
 * Runs against `DATABASE_URL` — must be the Neon development branch.
 *
 * Usage:
 *   npx tsx scripts/bench-pdf-download.ts             # seed + bench + cleanup
 *   npx tsx scripts/bench-pdf-download.ts --keep      # leave fixture in place
 *   npx tsx scripts/bench-pdf-download.ts --cleanup   # tear down fixture only
 */

import "dotenv/config";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../src/lib/prisma";
import { r2, R2_BUCKET, getPresignedDownloadUrl } from "../src/lib/r2";
import { getMonthDetail } from "../src/lib/db/staff";
import {
  buildTierBreakdown,
  type WeightTierSnapshot,
  type BonusTierSnapshotRow,
} from "../src/lib/staff/month-detail";
import { readBonusTierSnapshot } from "../src/lib/staff/bonus-tier-snapshot";
import { generateMonthDetailPdf } from "../src/lib/staff/month-detail-pdf";
import { pdfKey, putCached, hasCached } from "../src/lib/staff/pdf-cache";

const BENCH_AGENT_EMAIL = "bench-pdf-agent@easystaff.top";
const BENCH_BRANCH_CODE = "BENCHPDF";
const PARCEL_SIZES = [50, 500, 2000, 8000] as const;
const BENCH_YEAR = new Date().getFullYear();
const BENCH_MONTH = new Date().getMonth() + 1;

const DEFAULT_WEIGHT_TIERS = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null as number | null, commission: 2.2 },
];

type Sample = {
  label: string;
  salaryRecordId: string;
  dispatcherId: string;
  agentId: string;
  year: number;
  month: number;
  lineItemCount: number;
};

async function seed(): Promise<Sample[]> {
  console.log(`[bench] seeding ${PARCEL_SIZES.length} dispatchers at ${PARCEL_SIZES.join(", ")} parcels…`);

  const agent = await prisma.agent.upsert({
    where: { email: BENCH_AGENT_EMAIL },
    update: {},
    create: {
      email: BENCH_AGENT_EMAIL,
      name: "Bench PDF Agent",
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
      r2Key: `bench-pdf/${randomUUID()}.xlsx`,
      month: BENCH_MONTH,
      year: BENCH_YEAR,
      status: "SAVED",
    },
  });

  const samples: Sample[] = [];

  for (const parcelCount of PARCEL_SIZES) {
    const extId = `BENCHPDF${parcelCount}`;
    const dispatcher = await prisma.dispatcher.upsert({
      where: { branchId_extId: { branchId: branch.id, extId } },
      update: {},
      create: {
        agentId: agent.id,
        branchId: branch.id,
        extId,
        name: `Bench PDF ${parcelCount}p`,
        icNo: null,
        normalizedName: `bench pdf ${parcelCount}p`,
      },
    });

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

    for (const wt of DEFAULT_WEIGHT_TIERS) {
      await prisma.weightTier.upsert({
        where: { dispatcherId_tier: { dispatcherId: dispatcher.id, tier: wt.tier } },
        update: {},
        create: { ...wt, dispatcherId: dispatcher.id },
      });
    }

    await prisma.salaryRecord.deleteMany({
      where: { dispatcherId: dispatcher.id, uploadId: upload.id },
    });
    const lineItems = Array.from({ length: parcelCount }, (_, j) => {
      const weight = (j % 15) + 0.1;
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

    // Chunk inserts — single createMany on 8000 rows is fine but we chunk to
    // match production's own chunking pattern.
    const record = await prisma.salaryRecord.create({
      data: {
        dispatcherId: dispatcher.id,
        uploadId: upload.id,
        month: BENCH_MONTH,
        year: BENCH_YEAR,
        totalOrders: parcelCount,
        baseSalary: totalCommission,
        bonusTierEarnings: 0,
        commission: totalCommission,
        petrolSubsidy: 0,
        penalty: 0,
        advance: 0,
        netSalary: totalCommission,
        weightTiersSnapshot: DEFAULT_WEIGHT_TIERS,
      },
    });
    const chunkSize = 1000;
    for (let i = 0; i < lineItems.length; i += chunkSize) {
      await prisma.salaryLineItem.createMany({
        data: lineItems.slice(i, i + chunkSize).map((li) => ({
          ...li,
          salaryRecordId: record.id,
        })),
      });
    }

    samples.push({
      label: `${parcelCount}p`,
      salaryRecordId: record.id,
      dispatcherId: dispatcher.id,
      agentId: agent.id,
      year: BENCH_YEAR,
      month: BENCH_MONTH,
      lineItemCount: parcelCount,
    });
    console.log(`[bench] seeded ${parcelCount}-parcel dispatcher (record ${record.id})`);
  }

  return samples;
}

async function cleanup(): Promise<void> {
  console.log(`[bench] deleting fixture…`);
  const agent = await prisma.agent.findUnique({ where: { email: BENCH_AGENT_EMAIL } });
  if (!agent) {
    console.log("[bench] no fixture to delete");
    return;
  }
  // SalaryRecord -> Dispatcher has no cascade; nuke uploads first
  // (cascades salary records + line items), then the agent (cascades
  // branches + dispatchers + everything else).
  await prisma.upload.deleteMany({ where: { branch: { agentId: agent.id } } });
  await prisma.agent.delete({ where: { id: agent.id } });
  console.log("[bench] fixture deleted");
}

async function time<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - t0 };
}

type Bench = {
  label: string;
  parcels: number;
  dbFetchMs: number;
  pdfGenMs: number;
  r2PutMs: number;
  r2HeadMs: number;
  presignMs: number;
  r2GetMs: number;
  pdfBytes: number;
};

async function benchSample(s: Sample): Promise<Bench | null> {
  const headline = `[${s.label}] ${s.lineItemCount} line items  (record ${s.salaryRecordId})`;
  console.log("\n" + headline);
  console.log("-".repeat(headline.length));

  const dbFetch = await time(() => getMonthDetail(s.salaryRecordId, s.agentId));
  if (!dbFetch.value) {
    console.log("  !! getMonthDetail returned null, skipping");
    return null;
  }
  const detail = dbFetch.value;
  console.log(`  DB fetch (getMonthDetail)        : ${dbFetch.ms.toFixed(1).padStart(7)} ms`);

  const weightTiers = (detail.weightTiersSnapshot ?? []) as unknown as WeightTierSnapshot[];
  const bonusTierSnapshot = readBonusTierSnapshot(detail.bonusTierSnapshot);
  const bonusTiers = (bonusTierSnapshot?.tiers ?? undefined) as BonusTierSnapshotRow[] | undefined;
  const tierBreakdown = buildTierBreakdown(detail.lineItems, weightTiers, bonusTiers);

  const pdfGen = await time(() =>
    generateMonthDetailPdf({
      dispatcher: {
        name: detail.dispatcher.name,
        extId: detail.dispatcher.extId,
        branchCode: detail.dispatcher.branchCode,
      },
      month: detail.month,
      year: detail.year,
      totals: detail.totals,
      orderThreshold: bonusTierSnapshot?.orderThreshold ?? 2000,
      tierBreakdown,
      lineItems: detail.lineItems.map((li) => ({
        deliveryDate: li.deliveryDate,
        waybillNumber: li.waybillNumber,
        weight: li.weight,
        isBonusTier: li.isBonusTier,
      })),
    }),
  );
  const pdfBytes = pdfGen.value;
  const kb = (pdfBytes.byteLength / 1024).toFixed(1);
  console.log(`  PDF generation (react-pdf)       : ${pdfGen.ms.toFixed(1).padStart(7)} ms   (${kb} KB)`);

  // Use a throwaway key so we don't pollute the agent's real cache.
  const baseKey = pdfKey(s.agentId, s.year, s.month, s.salaryRecordId);
  const testKey = `${baseKey}.bench-${Date.now()}`;

  const r2Put = await time(() => putCached(testKey, pdfBytes, "application/pdf"));
  console.log(`  R2 PUT (write-through, async)    : ${r2Put.ms.toFixed(1).padStart(7)} ms`);

  const r2Head = await time(() => hasCached(testKey));
  console.log(`  R2 HEAD (cache-hit check)        : ${r2Head.ms.toFixed(1).padStart(7)} ms`);

  const presign = await time(() =>
    getPresignedDownloadUrl(testKey, {
      filename: `${s.year}_${String(s.month).padStart(2, "0")}_${detail.dispatcher.name}.pdf`,
      disposition: "inline",
      contentType: "application/pdf",
    }),
  );
  console.log(`  Presign URL                      : ${presign.ms.toFixed(1).padStart(7)} ms`);

  const r2Get = await time(async () => {
    const res = await fetch(presign.value, { method: "GET" });
    if (!res.ok) throw new Error(`R2 GET failed: ${res.status}`);
    await res.arrayBuffer();
    return res.status;
  });
  console.log(`  R2 GET (client-perceived)        : ${r2Get.ms.toFixed(1).padStart(7)} ms`);

  // Teardown the throwaway blob
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: testKey }));

  const missTotal = dbFetch.ms + pdfGen.ms; // what the user waits for on a cold click
  const hitTotal = r2Head.ms + presign.ms + r2Get.ms; // warm click

  console.log("");
  console.log(`  → COLD (cache miss) wall clock   : ${missTotal.toFixed(1).padStart(7)} ms   (bytes streamed from server)`);
  console.log(`  → WARM (cache hit)  wall clock   : ${hitTotal.toFixed(1).padStart(7)} ms   (bytes streamed from R2)`);

  return {
    label: s.label,
    parcels: s.lineItemCount,
    dbFetchMs: dbFetch.ms,
    pdfGenMs: pdfGen.ms,
    r2PutMs: r2Put.ms,
    r2HeadMs: r2Head.ms,
    presignMs: presign.ms,
    r2GetMs: r2Get.ms,
    pdfBytes: pdfBytes.byteLength,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--cleanup")) {
    await cleanup();
    await prisma.$disconnect();
    return;
  }

  const samples = await seed();

  // Warm up the Prisma pool + Neon compute so the first measured sample
  // doesn't get charged for the cold-connect ~1.8s.
  console.log("\n[bench] warming up connection…");
  await prisma.$queryRawUnsafe(`SELECT 1`);
  await getMonthDetail(samples[0].salaryRecordId, samples[0].agentId);

  const results: Bench[] = [];
  for (const s of samples) {
    const r = await benchSample(s);
    if (r) results.push(r);
  }

  // Repeat the largest sample — a single cold outlier could skew conclusions.
  console.log("\n[bench] re-running largest sample for stability check…");
  const largest = samples[samples.length - 1];
  const recheck = await benchSample(largest);
  if (recheck) {
    recheck.label = `${largest.label} (rerun)`;
    results.push(recheck);
  }

  console.log("\n\nSummary");
  console.log("=".repeat(104));
  const header = [
    "parcels".padStart(8),
    "dbMs".padStart(7),
    "pdfGenMs".padStart(9),
    "r2PutMs".padStart(9),
    "r2HeadMs".padStart(9),
    "presignMs".padStart(10),
    "r2GetMs".padStart(8),
    "pdfKB".padStart(8),
    "COLDms".padStart(8),
    "WARMms".padStart(8),
  ];
  console.log(header.join(""));
  for (const r of results) {
    const cold = r.dbFetchMs + r.pdfGenMs;
    const warm = r.r2HeadMs + r.presignMs + r.r2GetMs;
    const row = [
      String(r.parcels).padStart(8),
      r.dbFetchMs.toFixed(0).padStart(7),
      r.pdfGenMs.toFixed(0).padStart(9),
      r.r2PutMs.toFixed(0).padStart(9),
      r.r2HeadMs.toFixed(0).padStart(9),
      r.presignMs.toFixed(0).padStart(10),
      r.r2GetMs.toFixed(0).padStart(8),
      (r.pdfBytes / 1024).toFixed(0).padStart(8),
      cold.toFixed(0).padStart(8),
      warm.toFixed(0).padStart(8),
    ];
    console.log(row.join(""));
  }
  console.log("=".repeat(104));
  console.log("\nLegend:");
  console.log("  COLD = cache miss — user waits for DB fetch + PDF generation, then bytes stream back.");
  console.log("         (The async R2 PUT write-through doesn't block the response.)");
  console.log("  WARM = cache hit  — user waits for HEAD + presign (302 redirect) + R2 GET only.");
  console.log("         This is the dominant path after a month's prewarm runs.");
  console.log("\n  Server-side numbers only; add ~30-80ms for network RTT + Next.js middleware.");

  if (!args.has("--keep")) {
    await cleanup();
  } else {
    console.log(`\n[bench] --keep set, fixture left in place (agent=${BENCH_AGENT_EMAIL})`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
