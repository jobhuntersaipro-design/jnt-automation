import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const sample = await prisma.agent.findFirst({ select: { id: true } });
  if (!sample) throw new Error("No agents");
  console.log("agentId:", sample.id);
  try {
    const d = await prisma.dispatcher.findMany({
      where: { agentId: sample.id },
      include: {
        assignments: { include: { branch: { select: { code: true } } }, orderBy: { startedAt: "desc" } },
        weightTiers: { select: { tier: true, minWeight: true, maxWeight: true, commission: true }, orderBy: { tier: "asc" } },
        incentiveRule: { select: { orderThreshold: true } },
        bonusTiers: { select: { tier: true, minWeight: true, maxWeight: true, commission: true }, orderBy: { tier: "asc" } },
        petrolRule: { select: { isEligible: true, dailyThreshold: true, subsidyAmount: true } },
        salaryRecords: { select: { month: true, year: true }, orderBy: [{ year: "asc" }, { month: "asc" }], take: 1 },
      },
      take: 1,
    });
    console.log("rows:", d.length);
    if (d[0]) {
      console.log("first name:", d[0].name);
      console.log("bonusTiers:", d[0].bonusTiers);
    }
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : err);
    console.error((err as Error).stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
