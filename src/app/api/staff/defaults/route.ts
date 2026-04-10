import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const defaults = await prisma.agentDefault.findUnique({
    where: { agentId: session.user.id },
  });

  if (!defaults) {
    // Return hardcoded defaults if none saved yet
    return NextResponse.json({
      weightTiers: [
        { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
        { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
        { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
      ],
      incentiveRule: { orderThreshold: 2000, incentiveAmount: 200 },
      petrolRule: { isEligible: true, dailyThreshold: 70, subsidyAmount: 15 },
    });
  }

  return NextResponse.json({
    weightTiers: [
      { tier: 1, minWeight: defaults.tier1MinWeight, maxWeight: defaults.tier1MaxWeight, commission: defaults.tier1Commission },
      { tier: 2, minWeight: defaults.tier2MinWeight, maxWeight: defaults.tier2MaxWeight, commission: defaults.tier2Commission },
      { tier: 3, minWeight: defaults.tier3MinWeight, maxWeight: null, commission: defaults.tier3Commission },
    ],
    incentiveRule: { orderThreshold: defaults.orderThreshold, incentiveAmount: defaults.incentiveAmount },
    petrolRule: { isEligible: defaults.petrolEligible, dailyThreshold: defaults.dailyThreshold, subsidyAmount: defaults.subsidyAmount },
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { weightTiers, incentiveRule, petrolRule } = body as {
    weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
    incentiveRule: { orderThreshold: number; incentiveAmount: number };
    petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number };
  };

  const t1 = weightTiers.find((t) => t.tier === 1)!;
  const t2 = weightTiers.find((t) => t.tier === 2)!;
  const t3 = weightTiers.find((t) => t.tier === 3)!;

  await prisma.agentDefault.upsert({
    where: { agentId: session.user.id },
    create: {
      agentId: session.user.id,
      tier1MinWeight: t1.minWeight, tier1MaxWeight: t1.maxWeight ?? 5, tier1Commission: t1.commission,
      tier2MinWeight: t2.minWeight, tier2MaxWeight: t2.maxWeight ?? 10, tier2Commission: t2.commission,
      tier3MinWeight: t3.minWeight, tier3Commission: t3.commission,
      orderThreshold: incentiveRule.orderThreshold, incentiveAmount: incentiveRule.incentiveAmount,
      petrolEligible: petrolRule.isEligible, dailyThreshold: petrolRule.dailyThreshold, subsidyAmount: petrolRule.subsidyAmount,
    },
    update: {
      tier1MinWeight: t1.minWeight, tier1MaxWeight: t1.maxWeight ?? 5, tier1Commission: t1.commission,
      tier2MinWeight: t2.minWeight, tier2MaxWeight: t2.maxWeight ?? 10, tier2Commission: t2.commission,
      tier3MinWeight: t3.minWeight, tier3Commission: t3.commission,
      orderThreshold: incentiveRule.orderThreshold, incentiveAmount: incentiveRule.incentiveAmount,
      petrolEligible: petrolRule.isEligible, dailyThreshold: petrolRule.dailyThreshold, subsidyAmount: petrolRule.subsidyAmount,
    },
  });

  return NextResponse.json({ success: true });
}
