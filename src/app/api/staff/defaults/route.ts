import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { defaultsBodySchema } from "@/lib/validations/staff";

export async function GET() {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const defaults = await prisma.agentDefault.findUnique({
      where: { agentId },
    });

    if (!defaults) {
      return NextResponse.json({
        weightTiers: [
          { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
          { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
          { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
        ],
        bonusTiers: [
          { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
          { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
          { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
        ],
        incentiveRule: { orderThreshold: 2000 },
        petrolRule: { isEligible: true, dailyThreshold: 70, subsidyAmount: 15 },
      });
    }

    return NextResponse.json({
      weightTiers: [
        { tier: 1, minWeight: defaults.tier1MinWeight, maxWeight: defaults.tier1MaxWeight, commission: defaults.tier1Commission },
        { tier: 2, minWeight: defaults.tier2MinWeight, maxWeight: defaults.tier2MaxWeight, commission: defaults.tier2Commission },
        { tier: 3, minWeight: defaults.tier3MinWeight, maxWeight: null, commission: defaults.tier3Commission },
      ],
      bonusTiers: [
        { tier: 1, minWeight: defaults.tier1MinWeight, maxWeight: defaults.tier1MaxWeight, commission: defaults.bonusTier1Commission },
        { tier: 2, minWeight: defaults.tier2MinWeight, maxWeight: defaults.tier2MaxWeight, commission: defaults.bonusTier2Commission },
        { tier: 3, minWeight: defaults.tier3MinWeight, maxWeight: null, commission: defaults.bonusTier3Commission },
      ],
      incentiveRule: { orderThreshold: defaults.orderThreshold },
      petrolRule: { isEligible: defaults.petrolEligible, dailyThreshold: defaults.dailyThreshold, subsidyAmount: defaults.subsidyAmount },
    });
  } catch (err) {
    console.error("[staff/defaults] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const raw = await req.json();
    const parsed = defaultsBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { weightTiers, bonusTiers, incentiveRule, petrolRule } = parsed.data;

    const t1 = weightTiers.find((t) => t.tier === 1);
    const t2 = weightTiers.find((t) => t.tier === 2);
    const t3 = weightTiers.find((t) => t.tier === 3);

    if (!t1 || !t2 || !t3) {
      return NextResponse.json({ error: "All 3 weight tiers are required" }, { status: 400 });
    }

    const it1 = bonusTiers.find((t) => t.tier === 1);
    const it2 = bonusTiers.find((t) => t.tier === 2);
    const it3 = bonusTiers.find((t) => t.tier === 3);

    if (!it1 || !it2 || !it3) {
      return NextResponse.json({ error: "All 3 bonusTierEarnings tiers are required" }, { status: 400 });
    }

    const shared = {
      tier1MinWeight: t1.minWeight, tier1MaxWeight: t1.maxWeight ?? 5, tier1Commission: t1.commission,
      tier2MinWeight: t2.minWeight, tier2MaxWeight: t2.maxWeight ?? 10, tier2Commission: t2.commission,
      tier3MinWeight: t3.minWeight, tier3Commission: t3.commission,
      bonusTier1Commission: it1.commission,
      bonusTier2Commission: it2.commission,
      bonusTier3Commission: it3.commission,
      orderThreshold: incentiveRule.orderThreshold,
      petrolEligible: petrolRule.isEligible,
      dailyThreshold: petrolRule.dailyThreshold,
      subsidyAmount: petrolRule.subsidyAmount,
    };

    await prisma.agentDefault.upsert({
      where: { agentId },
      create: { agentId, ...shared },
      update: shared,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[staff/defaults] PUT error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
