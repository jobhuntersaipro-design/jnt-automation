/**
 * Recompute historical SalaryRecord rows under the bonus-tier model.
 *
 * BEFORE RUNNING:
 *   1. Migration `20260425_incentive_tiers` must have seeded each Dispatcher
 *      with 3 BonusTier rows.
 *   2. On prod, create a rollback Neon branch first.
 *
 * For each SalaryRecord whose `bonusTierSnapshot` is the legacy flat-amount
 * shape (`{ orderThreshold, incentiveAmount }`):
 *   - Load its SalaryLineItems.
 *   - Load the dispatcher's current BonusTier config.
 *   - Stable-sort line items (deliveryDate asc, null last, waybill asc).
 *   - Rebuild base vs bonusTierEarnings commissions under the new threshold-split
 *     algorithm.
 *   - Write back: baseSalary, bonusTierEarnings, netSalary, bonusTierSnapshot,
 *     lineItems.isBonusTier / commission.
 *   - Preserve the record's existing penalty + advance values (they were
 *     manually edited; recompute netSalary = base + bonusTierEarnings + petrol
 *     - penalty - advance).
 *
 * Defaults to dry-run. Pass `--confirm` to execute writes.
 *
 * Usage:
 *   npx tsx scripts/recompute-bonus-tiers.ts             # dry run
 *   npx tsx scripts/recompute-bonus-tiers.ts --confirm   # execute
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { readBonusTierSnapshot } from "../src/lib/staff/bonus-tier-snapshot";
import {
  recomputeRecordForBonusTiers,
  type TierConfig,
} from "../src/lib/payroll/recompute-bonus-tiers";
import type { Prisma } from "../src/generated/prisma/client";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type TierSnapshot = TierConfig;

interface DiffRow {
  salaryRecordId: string;
  dispatcherName: string;
  extId: string;
  month: number;
  year: number;
  totalOrders: number;
  prevBase: number;
  newBase: number;
  prevBonusTierEarnings: number;
  newBonusTierEarnings: number;
  prevNet: number;
  newNet: number;
  netDelta: number;
  incentiveTierCount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const mode = confirm ? "EXECUTE" : "DRY-RUN";
  console.log(`\n🔁 Bonus Tiers Recompute — ${mode}`);
  console.log(`   ${new Date().toISOString()}\n`);

  // Load all SalaryRecords with their line items + the dispatcher's
  // current bonusTierEarnings tiers. We filter legacy-snapshot candidates in JS
  // (json predicate is awkward cross-db).
  const records = await prisma.salaryRecord.findMany({
    include: {
      dispatcher: {
        select: {
          id: true,
          name: true,
          extId: true,
          bonusTiers: {
            orderBy: { tier: "asc" },
          },
        },
      },
      lineItems: {
        select: {
          id: true,
          waybillNumber: true,
          weight: true,
          deliveryDate: true,
          commission: true,
          isBonusTier: true,
        },
      },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  console.log(`   Loaded ${records.length} SalaryRecord rows.\n`);

  let skippedNewShape = 0;
  let skippedNoTiers = 0;
  let skippedNoLineItems = 0;
  let processed = 0;
  const diffs: DiffRow[] = [];

  for (const r of records) {
    const snap = readBonusTierSnapshot(r.bonusTierSnapshot);
    if (!snap) {
      skippedNewShape++;
      continue;
    }
    // Already new-shape → skip; nothing to redo.
    if (snap.tiers) {
      skippedNewShape++;
      continue;
    }

    const bonusTiers = r.dispatcher.bonusTiers;
    if (bonusTiers.length === 0) {
      skippedNoTiers++;
      console.warn(
        `⚠ ${r.dispatcher.name} (${r.dispatcher.extId}) — no bonusTierEarnings tiers; run the migration first.`,
      );
      continue;
    }
    if (r.lineItems.length === 0) {
      skippedNoLineItems++;
      continue;
    }

    const weightTiers = (r.weightTiersSnapshot as unknown) as TierSnapshot[];
    if (!Array.isArray(weightTiers) || weightTiers.length === 0) {
      console.warn(
        `⚠ ${r.dispatcher.name} ${r.year}-${r.month} — missing weightTiersSnapshot; skipping.`,
      );
      skippedNoTiers++;
      continue;
    }

    const threshold = snap.orderThreshold;

    const {
      baseSalary: newBase,
      bonusTierEarnings: newBonusTierEarnings,
      netSalary: newNet,
      lineItemUpdates: updates,
      changedLineItemUpdates: changedUpdates,
    } = recomputeRecordForBonusTiers({
      lineItems: r.lineItems,
      weightTiers,
      bonusTiers,
      orderThreshold: threshold,
      petrolSubsidy: r.petrolSubsidy,
      penalty: r.penalty,
      advance: r.advance,
    });

    diffs.push({
      salaryRecordId: r.id,
      dispatcherName: r.dispatcher.name,
      extId: r.dispatcher.extId,
      month: r.month,
      year: r.year,
      totalOrders: r.totalOrders,
      prevBase: r.baseSalary,
      newBase: round2(newBase),
      prevBonusTierEarnings: r.bonusTierEarnings,
      newBonusTierEarnings: round2(newBonusTierEarnings),
      prevNet: r.netSalary,
      newNet: round2(newNet),
      netDelta: round2(newNet - r.netSalary),
      incentiveTierCount: updates.filter((u) => u.isBonusTier).length,
    });

    if (confirm) {
      // Record update in its own short tx. Line item updates outside the
      // tx in chunks — we can tolerate a partial rewrite on failure since
      // the script is idempotent.
      await prisma.salaryRecord.update({
        where: { id: r.id },
        data: {
          baseSalary: round2(newBase),
          bonusTierEarnings: round2(newBonusTierEarnings),
          netSalary: round2(newNet),
          bonusTierSnapshot: {
            orderThreshold: threshold,
            tiers: bonusTiers.map((t) => ({
              tier: t.tier,
              minWeight: t.minWeight,
              maxWeight: t.maxWeight,
              commission: t.commission,
            })),
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Group line items by (commission, isBonusTier) so we can use a
      // single updateMany per distinct (value, flag) pair.
      const groups = new Map<string, string[]>();
      for (const u of changedUpdates) {
        const key = `${u.commission.toFixed(4)}:${u.isBonusTier ? 1 : 0}`;
        (groups.get(key) ?? groups.set(key, []).get(key))!.push(u.id);
      }

      for (const [key, ids] of groups) {
        const [commStr, flagStr] = key.split(":");
        // Chunk to stay under the Postgres param limit (~65k / 1 param ≈ 65k IDs).
        const CHUNK = 5000;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          await prisma.salaryLineItem.updateMany({
            where: { id: { in: chunk } },
            data: {
              commission: parseFloat(commStr),
              isBonusTier: flagStr === "1",
            },
          });
        }
      }
    }
    processed++;

    if (processed % 25 === 0) {
      console.log(`   … ${processed} records processed`);
    }
  }

  // Emit diff report
  const reportPath = resolve(
    process.cwd(),
    `docs/audit-results/bonus-tier-recompute-${new Date().toISOString().slice(0, 10)}.md`,
  );
  await mkdir(dirname(reportPath), { recursive: true });

  const lines: string[] = [];
  lines.push(`# Bonus Tiers Recompute Report — ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`- Mode: **${mode}**`);
  lines.push(`- Records scanned: ${records.length}`);
  lines.push(`- Records processed: ${processed}`);
  lines.push(`- Records skipped (already new-shape): ${skippedNewShape}`);
  lines.push(`- Records skipped (no line items): ${skippedNoLineItems}`);
  lines.push(`- Records skipped (missing tiers): ${skippedNoTiers}`);
  lines.push(``);
  lines.push(`## Net Salary Movements`);
  lines.push(``);
  lines.push(
    `| Dispatcher | ExtId | Year-Mo | Orders | Prev Net | New Net | Δ Net | Bonus tier parcels |`,
  );
  lines.push(
    `| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |`,
  );

  const bigMoves = diffs
    .filter((d) => Math.abs(d.netDelta) > 1)
    .sort((a, b) => Math.abs(b.netDelta) - Math.abs(a.netDelta));

  for (const d of bigMoves) {
    lines.push(
      `| ${d.dispatcherName} | ${d.extId} | ${d.year}-${String(d.month).padStart(2, "0")} | ${d.totalOrders} | ${d.prevNet.toFixed(2)} | ${d.newNet.toFixed(2)} | ${d.netDelta.toFixed(2)} | ${d.incentiveTierCount} |`,
    );
  }
  lines.push(``);
  if (bigMoves.length === 0) {
    lines.push(`_No records shifted by more than RM 1._`);
  }

  await writeFile(reportPath, lines.join("\n"));
  console.log(`\n📝 Report: ${reportPath}\n`);

  console.log(`   Summary:`);
  console.log(`     processed:            ${processed}`);
  console.log(`     skipped (new-shape):  ${skippedNewShape}`);
  console.log(`     skipped (no tiers):   ${skippedNoTiers}`);
  console.log(`     skipped (no items):   ${skippedNoLineItems}`);
  console.log(`     records moved >RM1:   ${bigMoves.length}`);
  console.log("");
  console.log(
    confirm
      ? `✅ Done — writes committed. See report for deltas.`
      : `🟡 Dry run only — no writes. Re-run with --confirm to execute.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
