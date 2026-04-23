import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { computeIsComplete } from "@/lib/db/staff";
import { deriveGender } from "@/lib/utils/gender";
import { settingsBodySchema } from "@/lib/validations/staff";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const { id } = await params;
    const { getDispatcherById } = await import("@/lib/db/staff");
    const detail = await getDispatcherById(agentId, id);

    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[staff/settings] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const { id } = await params;

    // Verify dispatcher belongs to this agent
    const dispatcher = await prisma.dispatcher.findFirst({
      where: { id, branch: { agentId } },
      select: { id: true, name: true, icNo: true, extId: true },
    });

    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const raw = await req.json();
    const parsed = settingsBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const body = parsed.data;

    // Track the final IC for completeness check
    let finalIcNo = dispatcher.icNo;

    await prisma.$transaction(async (tx) => {
      // Update branch
      if (body.branchCode) {
        const branch = await tx.branch.findFirst({
          where: { agentId, code: body.branchCode },
          select: { id: true },
        });
        if (!branch) {
          throw new Error("BRANCH_NOT_FOUND");
        }
        await tx.dispatcher.update({
          where: { id },
          data: { branchId: branch.id },
        });
      }

      // Update IC number + derived gender
      if (body.icNo !== undefined) {
        if (body.icNo.length > 0 && !/^\d{12}$/.test(body.icNo)) {
          throw new Error("IC_INVALID");
        }
        const gender = deriveGender(body.icNo);
        await tx.dispatcher.update({
          where: { id },
          data: { icNo: body.icNo, gender },
        });
        finalIcNo = body.icNo;
      }

      // Replace weight tiers atomically
      if (body.weightTiers) {
        await tx.weightTier.deleteMany({ where: { dispatcherId: id } });
        await tx.weightTier.createMany({
          data: body.weightTiers.map((wt) => ({
            dispatcherId: id,
            tier: wt.tier,
            minWeight: wt.minWeight,
            maxWeight: wt.maxWeight,
            commission: wt.commission,
          })),
        });
      }

      // Upsert bonusTierEarnings rule (threshold only)
      if (body.incentiveRule) {
        await tx.incentiveRule.upsert({
          where: { dispatcherId: id },
          create: {
            dispatcherId: id,
            orderThreshold: body.incentiveRule.orderThreshold,
          },
          update: {
            orderThreshold: body.incentiveRule.orderThreshold,
          },
        });
      }

      // Replace bonusTierEarnings tiers (same delete-then-createMany pattern as weight tiers)
      if (body.bonusTiers) {
        await tx.bonusTier.deleteMany({ where: { dispatcherId: id } });
        await tx.bonusTier.createMany({
          data: body.bonusTiers.map((it) => ({
            dispatcherId: id,
            tier: it.tier,
            minWeight: it.minWeight,
            maxWeight: it.maxWeight,
            commission: it.commission,
          })),
        });
      }

      // Upsert petrol rule
      if (body.petrolRule) {
        await tx.petrolRule.upsert({
          where: { dispatcherId: id },
          create: {
            dispatcherId: id,
            isEligible: body.petrolRule.isEligible,
            dailyThreshold: body.petrolRule.dailyThreshold,
            subsidyAmount: body.petrolRule.subsidyAmount,
          },
          update: {
            isEligible: body.petrolRule.isEligible,
            dailyThreshold: body.petrolRule.dailyThreshold,
            subsidyAmount: body.petrolRule.subsidyAmount,
          },
        });
      }
    });

    const isComplete = computeIsComplete(dispatcher.name, finalIcNo, dispatcher.extId);

    return NextResponse.json({ success: true, isComplete });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "BRANCH_NOT_FOUND") {
        return NextResponse.json({ error: "Branch not found" }, { status: 400 });
      }
      if (err.message === "IC_INVALID") {
        return NextResponse.json({ error: "IC number must be 12 digits" }, { status: 400 });
      }
    }
    console.error("[staff/settings] PATCH error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
