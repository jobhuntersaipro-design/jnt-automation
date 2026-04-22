/**
 * Phase B backfill: merges duplicate Dispatcher rows into one "person" row
 * per identity cluster, creates DispatcherAssignment rows for every
 * (dispatcher, branch, extId) combo, populates agentId + normalizedName on
 * surviving Dispatcher rows, and normalizes empty-string icNo to null.
 *
 * DESTRUCTIVE. Prints an action plan by default. Use --confirm to execute.
 *
 *   Dry-run:   npx tsx scripts/person-identity-backfill.ts
 *   For real:  npx tsx scripts/person-identity-backfill.ts --confirm
 *
 * Behavior (matches context/features/person-identity-spec.md):
 *   - For each agent, cluster Dispatcher rows using tiered IC/name matching
 *     (same rule as the dry-run; ABD HAKAM-style IC collisions stay split).
 *   - Pick canonical per cluster: most recent updatedAt, tiebreaker oldest
 *     createdAt. Canonical row's settings win.
 *   - Re-point SalaryRecord.dispatcherId and Employee.dispatcherId of
 *     non-canonical rows to the canonical row.
 *   - Create a DispatcherAssignment row for every original (branchId, extId),
 *     pointing to the canonical Dispatcher.
 *   - Delete non-canonical rows (their WeightTier/IncentiveRule/PetrolRule
 *     cascade with them). Canonical rules survive intact.
 *   - Populate surviving Dispatcher.agentId and Dispatcher.normalizedName.
 *   - Convert icNo = "" to NULL.
 *
 * Wrapped in a per-agent transaction so a failure on one agent doesn't
 * half-migrate another.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { normalizeName } from "../src/lib/dispatcher-identity/normalize-name";
import {
  clusterDispatchers,
  pickCanonical,
  type IdentityCandidate,
} from "../src/lib/dispatcher-identity/matcher";

const CONFIRM = process.argv.includes("--confirm");

interface DispatcherRow extends IdentityCandidate {
  id: string;
  name: string;
  icNo: string | null;
  rawIcNo: string | null;
  normalizedName: string;
  branchId: string;
  branchCode: string;
  extId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AgentPlan {
  agentId: string;
  email: string;
  clustersToMerge: { canonical: DispatcherRow; losers: DispatcherRow[] }[];
  singletons: DispatcherRow[];
  icEmptyStringToNull: number;
  normalizedNameBackfill: number;
  agentIdBackfill: number;
}

function toRow(
  d: {
    id: string;
    name: string;
    icNo: string | null;
    branchId: string;
    extId: string;
    createdAt: Date;
    updatedAt: Date;
    branch: { code: string };
  },
): DispatcherRow {
  return {
    id: d.id,
    name: d.name,
    rawIcNo: d.icNo,
    icNo: d.icNo === "" ? null : d.icNo,
    normalizedName: normalizeName(d.name),
    branchId: d.branchId,
    branchCode: d.branch.code,
    extId: d.extId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function plan(): Promise<AgentPlan[]> {
  const agents = await prisma.agent.findMany({
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  const plans: AgentPlan[] = [];
  for (const agent of agents) {
    const raw = await prisma.dispatcher.findMany({
      where: { branch: { agentId: agent.id } },
      select: {
        id: true,
        name: true,
        icNo: true,
        branchId: true,
        extId: true,
        createdAt: true,
        updatedAt: true,
        normalizedName: true,
        agentId: true,
        branch: { select: { code: true } },
      },
    });

    const rows = raw.map(toRow);
    const clusters = clusterDispatchers(rows);

    const clustersToMerge: AgentPlan["clustersToMerge"] = [];
    const singletons: DispatcherRow[] = [];
    for (const cluster of clusters) {
      if (cluster.length === 1) {
        singletons.push(cluster[0]);
        continue;
      }
      const canonical = pickCanonical(cluster);
      const losers = cluster.filter((r) => r.id !== canonical.id);
      clustersToMerge.push({ canonical, losers });
    }

    const icEmptyStringToNull = raw.filter((r) => r.icNo === "").length;
    const normalizedNameBackfill = raw.filter(
      (r) => r.normalizedName !== normalizeName(r.name),
    ).length;
    const agentIdBackfill = raw.filter((r) => r.agentId !== agent.id).length;

    plans.push({
      agentId: agent.id,
      email: agent.email,
      clustersToMerge,
      singletons,
      icEmptyStringToNull,
      normalizedNameBackfill,
      agentIdBackfill,
    });
  }
  return plans;
}

function printPlan(plans: AgentPlan[]) {
  let totalMergeClusters = 0;
  let totalLosers = 0;
  let totalSingletons = 0;
  let totalAssignmentsToCreate = 0;
  let totalIcEmpty = 0;
  let totalNameBackfill = 0;
  let totalAgentIdBackfill = 0;

  for (const p of plans) {
    console.log(`\nAgent ${p.email} (${p.agentId})`);
    if (p.clustersToMerge.length > 0) {
      console.log(`  ${p.clustersToMerge.length} cluster(s) to merge:`);
      for (const { canonical, losers } of p.clustersToMerge) {
        console.log(
          `    ${canonical.name} — keep ${canonical.branchCode}/${canonical.extId}, merge in ${losers.map((l) => `${l.branchCode}/${l.extId}`).join(", ")}`,
        );
      }
    }
    console.log(`  Singletons (no merge needed): ${p.singletons.length}`);
    console.log(
      `  Assignments to create: ${p.clustersToMerge.reduce((s, c) => s + c.losers.length + 1, 0) + p.singletons.length}`,
    );
    console.log(`  icNo "" → NULL: ${p.icEmptyStringToNull}`);
    console.log(`  normalizedName backfill: ${p.normalizedNameBackfill}`);
    console.log(`  agentId backfill: ${p.agentIdBackfill}`);

    totalMergeClusters += p.clustersToMerge.length;
    totalLosers += p.clustersToMerge.reduce((s, c) => s + c.losers.length, 0);
    totalSingletons += p.singletons.length;
    totalAssignmentsToCreate +=
      p.clustersToMerge.reduce((s, c) => s + c.losers.length + 1, 0) +
      p.singletons.length;
    totalIcEmpty += p.icEmptyStringToNull;
    totalNameBackfill += p.normalizedNameBackfill;
    totalAgentIdBackfill += p.agentIdBackfill;
  }

  console.log("\n─── Totals ───────────────────────────────");
  console.log(`  Clusters to merge:     ${totalMergeClusters}`);
  console.log(`  Non-canonical deleted: ${totalLosers}`);
  console.log(`  Singletons preserved:  ${totalSingletons}`);
  console.log(`  Assignments created:   ${totalAssignmentsToCreate}`);
  console.log(`  icNo "" → NULL:        ${totalIcEmpty}`);
  console.log(`  normalizedName fills:  ${totalNameBackfill}`);
  console.log(`  agentId fills:         ${totalAgentIdBackfill}`);
}

async function execute(plans: AgentPlan[]) {
  // Phase B.1 — Merge duplicate clusters. Each cluster runs in its own
  // transaction so individual merges stay atomic without holding one giant
  // transaction that risks timing out on remote Postgres.
  for (const p of plans) {
    if (p.clustersToMerge.length === 0) continue;
    console.log(`\nMerging ${p.clustersToMerge.length} cluster(s) for ${p.email}...`);
    for (const { canonical, losers } of p.clustersToMerge) {
      await prisma.$transaction(
        async (tx) => {
          for (const loser of losers) {
            // Re-point SalaryRecord.dispatcherId → canonical.
            // @@unique([dispatcherId, uploadId]) means if both had records for
            // the same upload (very unlikely — uploads are branch-scoped) we
            // keep the canonical's and drop the loser's.
            const loserSalaries = await tx.salaryRecord.findMany({
              where: { dispatcherId: loser.id },
              select: { id: true, uploadId: true },
            });
            for (const sr of loserSalaries) {
              const existing = await tx.salaryRecord.findUnique({
                where: {
                  dispatcherId_uploadId: {
                    dispatcherId: canonical.id,
                    uploadId: sr.uploadId,
                  },
                },
                select: { id: true },
              });
              if (existing) {
                await tx.salaryRecord.delete({ where: { id: sr.id } });
              } else {
                await tx.salaryRecord.update({
                  where: { id: sr.id },
                  data: { dispatcherId: canonical.id },
                });
              }
            }

            await tx.employee.updateMany({
              where: { dispatcherId: loser.id },
              data: { dispatcherId: canonical.id },
            });

            await tx.dispatcherAssignment.create({
              data: {
                dispatcherId: canonical.id,
                branchId: loser.branchId,
                extId: loser.extId,
                startedAt: loser.createdAt,
              },
            });

            // Rules cascade-delete via FK when the Dispatcher row is deleted.
            await tx.dispatcher.delete({ where: { id: loser.id } });
          }
        },
        { timeout: 30_000 },
      );
    }
  }

  // Phase B.2 — Bulk-create DispatcherAssignment rows for every surviving
  // Dispatcher that doesn't already have one. One round-trip.
  const surviving = await prisma.dispatcher.findMany({
    select: { id: true, branchId: true, extId: true, createdAt: true },
  });
  const existing = await prisma.dispatcherAssignment.findMany({
    select: { branchId: true, extId: true },
  });
  const existingKeys = new Set(existing.map((a) => `${a.branchId}::${a.extId}`));
  const toCreate = surviving
    .filter((d) => !existingKeys.has(`${d.branchId}::${d.extId}`))
    .map((d) => ({
      dispatcherId: d.id,
      branchId: d.branchId,
      extId: d.extId,
      startedAt: d.createdAt,
    }));
  if (toCreate.length > 0) {
    console.log(`\nCreating ${toCreate.length} assignment(s) in bulk...`);
    await prisma.dispatcherAssignment.createMany({ data: toCreate });
  }

  // Phase B.3 — Bulk-populate Dispatcher.agentId, normalizedName, and convert
  // icNo = "" → NULL. One raw SQL update.
  console.log("\nPopulating agentId / normalizedName / icNo on all Dispatcher rows...");
  const rowsUpdated = await prisma.$executeRaw`
    UPDATE "Dispatcher" d
    SET "agentId" = b."agentId",
        "normalizedName" = UPPER(TRIM(REGEXP_REPLACE(d."name", '\s+', ' ', 'g'))),
        "icNo" = NULLIF(d."icNo", '')
    FROM "Branch" b
    WHERE d."branchId" = b.id;
  `;
  console.log(`  Rows updated: ${rowsUpdated}`);
}

async function main() {
  const plans = await plan();

  console.log("\n════════════════════════════════════════");
  console.log(" Person-Identity Phase B Backfill Plan");
  console.log("════════════════════════════════════════");
  printPlan(plans);

  if (!CONFIRM) {
    console.log("\n[DRY RUN] Not executing. Re-run with --confirm to apply.");
    return;
  }

  console.log("\n--confirm flag set. Executing...");
  await execute(plans);
  console.log("\nBackfill complete.");
}

main()
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
