/**
 * Phase A dry-run: analyze existing Dispatcher rows and report the clusters
 * that the person-identity backfill would produce. Zero writes. Outputs a
 * markdown report to docs/audit-results/person-identity-dry-run.md that the
 * user reviews before we commit Phase B's destructive backfill.
 *
 * Run:  npx tsx scripts/person-identity-dry-run.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "../src/lib/prisma";
import { normalizeName } from "../src/lib/dispatcher-identity/normalize-name";
import {
  clusterDispatchers,
  normalizeIc,
  pickCanonical,
  type IdentityCandidate,
} from "../src/lib/dispatcher-identity/matcher";

// ─── Types ────────────────────────────────────────────────────

type WeightTierSnapshot = {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
};

interface DispatcherRow extends IdentityCandidate {
  id: string;
  name: string;
  rawName: string;
  rawIcNo: string | null;
  normalizedName: string;
  icNo: string | null;
  branchCode: string;
  branchId: string;
  extId: string;
  agentId: string;
  agentEmail: string;
  createdAt: Date;
  updatedAt: Date;
  weightTiers: WeightTierSnapshot[];
  bonusTierEarnings: { orderThreshold: number } | null;
  petrol: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number } | null;
}

interface ClusterAnalysis {
  rows: DispatcherRow[];
  canonical: DispatcherRow;
  nameOnlyMatch: boolean; // true if no row in cluster has an IC
  settingsConflicts: string[]; // human-readable diffs
}

// ─── Settings diff ────────────────────────────────────────────

function tiersToString(tiers: WeightTierSnapshot[]): string {
  return [...tiers]
    .sort((a, b) => a.tier - b.tier)
    .map((t) => {
      const max = t.maxWeight == null ? "∞" : t.maxWeight.toFixed(2);
      return `T${t.tier}(${t.minWeight.toFixed(2)}–${max}@RM${t.commission.toFixed(2)})`;
    })
    .join(" · ");
}

function detectSettingsConflicts(rows: DispatcherRow[]): string[] {
  if (rows.length < 2) return [];
  const conflicts: string[] = [];

  const tierStrings = new Set(rows.map((r) => tiersToString(r.weightTiers)));
  if (tierStrings.size > 1) {
    conflicts.push(
      "Weight tiers differ:\n" +
        rows
          .map((r) => `    - ${r.branchCode}/${r.extId}: ${tiersToString(r.weightTiers)}`)
          .join("\n"),
    );
  }

  const incStrings = new Set(
    rows.map((r) => (r.bonusTierEarnings ? `${r.bonusTierEarnings.orderThreshold}o` : "(none)")),
  );
  if (incStrings.size > 1) {
    conflicts.push(
      "Bonus tier threshold differs:\n" +
        rows
          .map(
            (r) =>
              `    - ${r.branchCode}/${r.extId}: ${
                r.bonusTierEarnings ? `≥${r.bonusTierEarnings.orderThreshold} orders` : "(none)"
              }`,
          )
          .join("\n"),
    );
  }

  const petrolStrings = new Set(
    rows.map((r) =>
      r.petrol
        ? `${r.petrol.isEligible ? "E" : "N"}:${r.petrol.dailyThreshold}/RM${r.petrol.subsidyAmount.toFixed(2)}`
        : "(none)",
    ),
  );
  if (petrolStrings.size > 1) {
    conflicts.push(
      "Petrol rule differs:\n" +
        rows
          .map(
            (r) =>
              `    - ${r.branchCode}/${r.extId}: ${
                r.petrol
                  ? `${r.petrol.isEligible ? "eligible" : "ineligible"}, ≥${r.petrol.dailyThreshold}/day → RM${r.petrol.subsidyAmount.toFixed(2)}`
                  : "(none)"
              }`,
          )
          .join("\n"),
    );
  }

  return conflicts;
}

// ─── Report renderer ──────────────────────────────────────────

function maskIc(ic: string | null): string {
  if (!ic) return "—";
  const normalized = normalizeIc(ic);
  if (!normalized || normalized.length < 4) return "****";
  return `****${normalized.slice(-4)}`;
}

function renderReport(opts: {
  totalRows: number;
  totalAgents: number;
  totalProjectedPersons: number;
  agentReports: AgentReport[];
  runAt: Date;
}): string {
  const multiBranchCount = opts.agentReports.reduce(
    (sum, a) => sum + a.clusters.filter((c) => c.rows.length > 1).length,
    0,
  );
  const conflictCount = opts.agentReports.reduce(
    (sum, a) => sum + a.clusters.filter((c) => c.settingsConflicts.length > 0).length,
    0,
  );
  const nameOnlyCount = opts.agentReports.reduce(
    (sum, a) =>
      sum + a.clusters.filter((c) => c.rows.length > 1 && c.nameOnlyMatch).length,
    0,
  );
  const icCollisionCount = opts.agentReports.reduce(
    (sum, a) => sum + a.icCollisions.length,
    0,
  );

  const lines: string[] = [];
  lines.push("# Person Identity — Phase A Dry-Run Report");
  lines.push("");
  lines.push(`Generated: ${opts.runAt.toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **${opts.totalAgents}** agents`);
  lines.push(
    `- **${opts.totalRows}** dispatcher rows today → **${opts.totalProjectedPersons}** unique persons after dedup`,
  );
  lines.push(`- **${multiBranchCount}** multi-branch transfers detected`);
  lines.push(`- **${conflictCount}** clusters with settings conflicts to review`);
  lines.push(
    `- **${nameOnlyCount}** clusters matched by name alone (no IC) — needs user spot-check`,
  );
  lines.push(
    `- **${icCollisionCount}** IC collisions (same IC, different people) — needs data fix`,
  );
  lines.push("");

  if (multiBranchCount === 0) {
    lines.push("_No dispatcher appears in more than one branch. Phase B backfill would be a no-op for merging._");
    lines.push("");
  }

  for (const agent of opts.agentReports) {
    lines.push(`## Agent: ${agent.email} (${agent.agentId})`);
    lines.push("");
    lines.push(
      `Rows: ${agent.totalRows} → projected unique persons: ${agent.clusters.length}`,
    );
    lines.push("");

    if (agent.icCollisions.length > 0) {
      lines.push(`### ⚠ IC collisions (${agent.icCollisions.length})`);
      lines.push("");
      lines.push(
        "Records below share an IC but were **not merged** because their first names disagree. Most likely one row has the wrong IC. Fix the data (edit the IC on the wrong row in Settings) before running Phase B, otherwise these stay as separate persons.",
      );
      lines.push("");
      for (const collision of agent.icCollisions) {
        lines.push(`#### Shared IC ${collision.maskedIc}`);
        lines.push("");
        lines.push("| Branch / ExtId | Name as stored |");
        lines.push("|---|---|");
        for (const r of collision.rows) {
          lines.push(`| ${r.branchCode} / ${r.extId} | ${r.rawName || "—"} |`);
        }
        lines.push("");
      }
    }

    const multi = agent.clusters.filter((c) => c.rows.length > 1);
    if (multi.length === 0) {
      lines.push("_No transfers detected for this agent._");
      lines.push("");
      continue;
    }

    lines.push(`### Multi-branch clusters (${multi.length})`);
    lines.push("");

    for (const cluster of multi) {
      const displayName = cluster.canonical.rawName || "(no name)";
      const icNote = cluster.nameOnlyMatch ? " ⚠ NAME-ONLY MATCH" : "";
      lines.push(`#### ${displayName}${icNote}`);
      lines.push("");
      lines.push(`Canonical row (latest updatedAt): ${cluster.canonical.branchCode}/${cluster.canonical.extId}`);
      lines.push("");
      lines.push("| Branch / ExtId | IC | Name as stored | Updated | Created |");
      lines.push("|---|---|---|---|---|");
      for (const r of cluster.rows) {
        const marker = r.id === cluster.canonical.id ? "**" : "";
        lines.push(
          `| ${marker}${r.branchCode} / ${r.extId}${marker} | ${maskIc(r.rawIcNo)} | ${r.rawName || "—"} | ${r.updatedAt.toISOString().slice(0, 10)} | ${r.createdAt.toISOString().slice(0, 10)} |`,
        );
      }
      lines.push("");

      if (cluster.settingsConflicts.length > 0) {
        lines.push("**Settings conflicts — canonical row's values will win in Phase B:**");
        lines.push("");
        for (const c of cluster.settingsConflicts) {
          lines.push(`- ${c}`);
        }
        lines.push("");
      }
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("## Next steps");
  lines.push("");
  lines.push("Review the clusters above. Pay close attention to:");
  lines.push("");
  lines.push("1. **Name-only matches** (⚠) — confirm they really are the same person. Two different humans with identical names and no IC would be wrongly merged. If any look wrong, flag them before we run the Phase B backfill.");
  lines.push("2. **Settings conflicts** — the canonical row's values will win. If you want different rules to survive on a particular cluster, update that dispatcher's settings on the canonical row before running Phase B.");
  lines.push("3. **Projected person count** — does the after-dedup number match your intuition of how many real humans you employ?");
  lines.push("");
  lines.push("Once reviewed, sign off and we'll run the Phase B backfill to consolidate the data.");

  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────

interface AgentReport {
  agentId: string;
  email: string;
  totalRows: number;
  clusters: ClusterAnalysis[];
  icCollisions: IcCollision[];
}

interface IcCollision {
  maskedIc: string;
  rows: DispatcherRow[];
}

async function main() {
  const runAt = new Date();

  const agents = await prisma.agent.findMany({
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  const agentReports: AgentReport[] = [];
  let totalRows = 0;
  let totalProjectedPersons = 0;

  for (const agent of agents) {
    const raw = await prisma.dispatcher.findMany({
      where: { branch: { agentId: agent.id } },
      include: {
        branch: { select: { id: true, code: true } },
        weightTiers: true,
        incentiveRule: true,
        petrolRule: true,
      },
    });

    totalRows += raw.length;

    const rows: DispatcherRow[] = raw.map((d) => ({
      id: d.id,
      name: d.name,
      rawName: d.name,
      rawIcNo: d.icNo ?? null,
      icNo: d.icNo ?? null,
      normalizedName: normalizeName(d.name),
      branchCode: d.branch.code,
      branchId: d.branch.id,
      extId: d.extId,
      agentId: agent.id,
      agentEmail: agent.email,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      weightTiers: d.weightTiers.map((t) => ({
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
      bonusTierEarnings: d.incentiveRule
        ? {
            orderThreshold: d.incentiveRule.orderThreshold,
          }
        : null,
      petrol: d.petrolRule
        ? {
            isEligible: d.petrolRule.isEligible,
            dailyThreshold: d.petrolRule.dailyThreshold,
            subsidyAmount: d.petrolRule.subsidyAmount,
          }
        : null,
    }));

    const clusters = clusterDispatchers(rows);
    const analysis: ClusterAnalysis[] = clusters.map((group) => {
      const canonical = pickCanonical(group);
      const nameOnlyMatch = group.every((r) => normalizeIc(r.icNo) === null);
      const settingsConflicts = detectSettingsConflicts(group);
      return { rows: group, canonical, nameOnlyMatch, settingsConflicts };
    });

    totalProjectedPersons += analysis.length;

    // Detect IC collisions: a single normalized IC that spans multiple
    // clusters after the first-name guard split them apart.
    const clusterByIc = new Map<string, Set<number>>();
    analysis.forEach((cluster, clusterIdx) => {
      for (const r of cluster.rows) {
        const ic = normalizeIc(r.icNo);
        if (!ic) continue;
        const set = clusterByIc.get(ic) ?? new Set<number>();
        set.add(clusterIdx);
        clusterByIc.set(ic, set);
      }
    });
    const icCollisions: IcCollision[] = [];
    for (const [ic, clusterIdxs] of clusterByIc) {
      if (clusterIdxs.size < 2) continue;
      const collisionRows: DispatcherRow[] = [];
      for (const idx of clusterIdxs) {
        for (const r of analysis[idx].rows) {
          if (normalizeIc(r.icNo) === ic) collisionRows.push(r);
        }
      }
      icCollisions.push({ maskedIc: `****${ic.slice(-4)}`, rows: collisionRows });
    }

    agentReports.push({
      agentId: agent.id,
      email: agent.email,
      totalRows: rows.length,
      clusters: analysis,
      icCollisions,
    });
  }

  const report = renderReport({
    totalRows,
    totalAgents: agents.length,
    totalProjectedPersons,
    agentReports,
    runAt,
  });

  const outPath = "docs/audit-results/person-identity-dry-run.md";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, report, "utf8");

  // Short stdout summary for the shell runner.
  console.log(`\nDry-run complete. Report: ${outPath}`);
  console.log(`  Agents: ${agents.length}`);
  console.log(`  Dispatcher rows: ${totalRows}`);
  console.log(`  Projected unique persons: ${totalProjectedPersons}`);
  const multi = agentReports.reduce(
    (s, a) => s + a.clusters.filter((c) => c.rows.length > 1).length,
    0,
  );
  console.log(`  Multi-branch clusters: ${multi}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
