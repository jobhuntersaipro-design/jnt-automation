import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { applyDefaultsBodySchema } from "@/lib/validations/staff";

export async function POST(req: NextRequest) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const raw = await req.json();
    const parsed = applyDefaultsBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const body = parsed.data;

    // Resolve optional branch filter — when the caller is editing one
    // branch's defaults, "apply to all" should mean "all dispatchers in that
    // branch", not every dispatcher across the agent. Explicit
    // dispatcherIds always win over the branch narrowing.
    let branchId: string | undefined;
    if (body.branchCode) {
      const branch = await prisma.branch.findFirst({
        where: { agentId, code: body.branchCode },
        select: { id: true },
      });
      if (!branch) {
        return NextResponse.json({ error: "Branch not found" }, { status: 404 });
      }
      branchId = branch.id;
    }

    // Get dispatcher IDs — filtered to selection if provided, otherwise the
    // branch (if specified), otherwise all.
    const dispatchers = await prisma.dispatcher.findMany({
      where: {
        branch: { agentId },
        ...(body.dispatcherIds && body.dispatcherIds.length > 0
          ? { id: { in: body.dispatcherIds } }
          : branchId
            ? { branchId }
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

      // Incentive rule (orderThreshold): delete existing + bulk create
      await tx.incentiveRule.deleteMany({ where: { dispatcherId: { in: ids } } });
      await tx.incentiveRule.createMany({
        data: ids.map((dispatcherId) => ({
          dispatcherId,
          orderThreshold: body.incentiveRule.orderThreshold,
        })),
      });

      // Bonus tiers: delete existing + bulk create
      await tx.bonusTier.deleteMany({ where: { dispatcherId: { in: ids } } });
      await tx.bonusTier.createMany({
        data: ids.flatMap((dispatcherId) =>
          body.bonusTiers.map((it) => ({
            dispatcherId,
            tier: it.tier,
            minWeight: it.minWeight,
            maxWeight: it.maxWeight,
            commission: it.commission,
          })),
        ),
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
  } catch (err) {
    console.error("[staff/apply-defaults] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
