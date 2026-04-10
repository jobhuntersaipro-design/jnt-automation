import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

interface WeightTierInput {
  tier: 1 | 2 | 3;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface DefaultsBody {
  weightTiers: WeightTierInput[];
  incentiveRule: { orderThreshold: number; incentiveAmount: number };
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number };
  dispatcherIds?: string[];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: DefaultsBody = await req.json();

  if (!body.weightTiers || body.weightTiers.length !== 3 || !body.incentiveRule || !body.petrolRule) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const agentId = session.user.id;

  // Get dispatcher IDs — filtered to selection if provided, otherwise all
  const dispatchers = await prisma.dispatcher.findMany({
    where: {
      branch: { agentId },
      ...(body.dispatcherIds && body.dispatcherIds.length > 0
        ? { id: { in: body.dispatcherIds } }
        : {}),
    },
    select: { id: true },
  });

  if (dispatchers.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const ids = dispatchers.map((d) => d.id);

  // Use batched operations instead of per-row upserts to avoid transaction timeouts
  await prisma.$transaction(async (tx) => {
    // Weight tiers: delete existing + bulk create
    await tx.weightTier.deleteMany({ where: { dispatcherId: { in: ids } } });
    await tx.weightTier.createMany({
      data: ids.flatMap((dispatcherId) =>
        body.weightTiers.map((wt) => ({
          dispatcherId,
          tier: wt.tier,
          minWeight: wt.minWeight,
          maxWeight: wt.maxWeight,
          commission: wt.commission,
        })),
      ),
    });

    // Incentive rules: delete existing + bulk create
    await tx.incentiveRule.deleteMany({ where: { dispatcherId: { in: ids } } });
    await tx.incentiveRule.createMany({
      data: ids.map((dispatcherId) => ({
        dispatcherId,
        orderThreshold: body.incentiveRule.orderThreshold,
        incentiveAmount: body.incentiveRule.incentiveAmount,
      })),
    });

    // Petrol rules: delete existing + bulk create
    await tx.petrolRule.deleteMany({ where: { dispatcherId: { in: ids } } });
    await tx.petrolRule.createMany({
      data: ids.map((dispatcherId) => ({
        dispatcherId,
        isEligible: body.petrolRule.isEligible,
        dailyThreshold: body.petrolRule.dailyThreshold,
        subsidyAmount: body.petrolRule.subsidyAmount,
      })),
    });
  }, { timeout: 30000 });

  return NextResponse.json({ count: dispatchers.length });
}
