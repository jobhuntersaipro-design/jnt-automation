import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { deriveGender } from "@/lib/utils/gender";
import { computeIsComplete, getAgentDefaults } from "@/lib/db/staff";
import { normalizeName } from "@/lib/dispatcher-identity/normalize-name";

export async function POST(req: NextRequest) {
  try {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const agentId = effective.agentId;

  const body = await req.json();
  const { name, extId, icNo, branchCode } = body as {
    name?: string;
    extId?: string;
    icNo?: string;
    branchCode?: string;
  };

  if (!name?.trim() || !extId?.trim() || !branchCode) {
    return NextResponse.json({ error: "Name, ID, and branch are required" }, { status: 400 });
  }

  if (icNo && icNo.trim() && !/^\d{12}$/.test(icNo)) {
    return NextResponse.json({ error: "IC number must be 12 digits" }, { status: 400 });
  }

  // Verify branch belongs to this agent
  const branch = await prisma.branch.findFirst({
    where: { code: branchCode, agentId },
    select: { id: true, code: true },
  });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const trimmedExtId = extId.trim();

  // Uniqueness check goes against DispatcherAssignment — a (branchId, extId)
  // is one branch-specific J&T ID, and assignments are the authoritative
  // index of that mapping after Phase B.
  const existing = await prisma.dispatcherAssignment.findUnique({
    where: { branchId_extId: { branchId: branch.id, extId: trimmedExtId } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A dispatcher with this ID already exists in the selected branch" },
      { status: 409 },
    );
  }

  const trimmedIcNo = icNo?.trim();
  const safeIcNo = trimmedIcNo ? trimmedIcNo : null;
  const gender = safeIcNo ? deriveGender(safeIcNo) : "UNKNOWN" as const;
  const trimmedName = name.trim();

  const defs = await getAgentDefaults(agentId);
  const wt = defs.weightTiers;
  const ir = defs.incentiveRule;
  const pr = defs.petrolRule;

  const dispatcher = await prisma.$transaction(async (tx) => {
    const d = await tx.dispatcher.create({
      data: {
        agentId,
        name: trimmedName,
        normalizedName: normalizeName(trimmedName),
        extId: trimmedExtId,
        icNo: safeIcNo,
        gender,
        branchId: branch.id,
      },
    });

    await tx.dispatcherAssignment.create({
      data: {
        dispatcherId: d.id,
        branchId: branch.id,
        extId: trimmedExtId,
      },
    });

    await tx.weightTier.createMany({
      data: wt.map((t) => ({
        dispatcherId: d.id,
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
    });

    await tx.incentiveRule.create({
      data: { dispatcherId: d.id, orderThreshold: ir.orderThreshold, incentiveAmount: ir.incentiveAmount },
    });

    await tx.petrolRule.create({
      data: { dispatcherId: d.id, isEligible: pr.isEligible, dailyThreshold: pr.dailyThreshold, subsidyAmount: pr.subsidyAmount },
    });

    return d;
  });

  return NextResponse.json({
    dispatcher: {
      id: dispatcher.id,
      extId: dispatcher.extId,
      name: dispatcher.name,
      icNo: dispatcher.icNo,
      gender: dispatcher.gender,
      avatarUrl: dispatcher.avatarUrl,
      isPinned: false,
      branchCode: branch.code,
      isComplete: computeIsComplete(dispatcher.name, dispatcher.icNo, dispatcher.extId),
      rawIcNo: dispatcher.icNo,
      weightTiers: wt,
      incentiveRule: ir,
      petrolRule: pr,
    },
  }, { status: 201 });
  } catch (err) {
    console.error("[staff] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
