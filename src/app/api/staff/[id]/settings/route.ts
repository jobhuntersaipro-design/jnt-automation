import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDispatcherById } from "@/lib/db/staff";
import { deriveGender } from "@/lib/utils/gender";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const detail = await getDispatcherById(session.user.id, id);

  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

interface WeightTierInput {
  tier: 1 | 2 | 3;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface SettingsBody {
  icNo?: string;
  weightTiers?: WeightTierInput[];
  incentiveRule?: { orderThreshold: number; incentiveAmount: number };
  petrolRule?: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify dispatcher belongs to this agent
  const dispatcher = await prisma.dispatcher.findFirst({
    where: { id, branch: { agentId: session.user.id } },
    select: { id: true },
  });

  if (!dispatcher) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body: SettingsBody = await req.json();

  // Update IC number + derived gender
  if (body.icNo !== undefined) {
    if (body.icNo.length > 0 && !/^\d{12}$/.test(body.icNo)) {
      return NextResponse.json({ error: "IC number must be 12 digits" }, { status: 400 });
    }
    const gender = deriveGender(body.icNo);
    await prisma.dispatcher.update({
      where: { id },
      data: { icNo: body.icNo, gender },
    });
  }

  // Upsert weight tiers
  if (body.weightTiers) {
    for (const wt of body.weightTiers) {
      await prisma.weightTier.upsert({
        where: { dispatcherId_tier: { dispatcherId: id, tier: wt.tier } },
        create: {
          dispatcherId: id,
          tier: wt.tier,
          minWeight: wt.minWeight,
          maxWeight: wt.maxWeight,
          commission: wt.commission,
        },
        update: {
          minWeight: wt.minWeight,
          maxWeight: wt.maxWeight,
          commission: wt.commission,
        },
      });
    }
  }

  // Upsert incentive rule
  if (body.incentiveRule) {
    await prisma.incentiveRule.upsert({
      where: { dispatcherId: id },
      create: {
        dispatcherId: id,
        orderThreshold: body.incentiveRule.orderThreshold,
        incentiveAmount: body.incentiveRule.incentiveAmount,
      },
      update: {
        orderThreshold: body.incentiveRule.orderThreshold,
        incentiveAmount: body.incentiveRule.incentiveAmount,
      },
    });
  }

  // Upsert petrol rule
  if (body.petrolRule) {
    await prisma.petrolRule.upsert({
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

  // Recompute completeness
  const updated = await prisma.dispatcher.findUnique({
    where: { id },
    select: { name: true, icNo: true, extId: true },
  });

  const isComplete =
    !!updated &&
    updated.name.length > 0 &&
    updated.icNo.length > 0 &&
    updated.extId.length > 0;

  return NextResponse.json({ success: true, isComplete });
}
