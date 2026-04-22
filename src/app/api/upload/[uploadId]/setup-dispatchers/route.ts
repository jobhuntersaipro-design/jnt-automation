import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { deriveGender } from "@/lib/utils/gender";
import { normalizeName } from "@/lib/dispatcher-identity/normalize-name";

interface DispatcherInput {
  extId: string;
  name: string;
  icNo: string;
  weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  incentiveRule: { orderThreshold: number; incentiveAmount: number };
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number };
}

/**
 * POST /api/upload/[uploadId]/setup-dispatchers
 * Create unknown dispatchers with their salary rules in a single transaction.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await verifyUploadOwnership(uploadId, session.user.id);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "NEEDS_ATTENTION" && upload.status !== "CONFIRM_SETTINGS") {
    return NextResponse.json(
      { error: "Upload is not in a valid state for dispatcher setup" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { dispatchers } = body as { dispatchers?: DispatcherInput[] };

  if (!dispatchers || dispatchers.length === 0) {
    return NextResponse.json({ error: "No dispatchers provided" }, { status: 400 });
  }

  // Validate all dispatchers
  for (const d of dispatchers) {
    if (!d.extId?.trim() || !d.name?.trim()) {
      return NextResponse.json(
        { error: `Missing required fields for dispatcher ${d.extId || "unknown"}` },
        { status: 400 },
      );
    }
    if (d.icNo && d.icNo.trim() && !/^\d{12}$/.test(d.icNo)) {
      return NextResponse.json(
        { error: `IC number must be 12 digits for ${d.name}` },
        { status: 400 },
      );
    }
    if (!d.weightTiers || d.weightTiers.length !== 3) {
      return NextResponse.json(
        { error: `3 weight tiers required for ${d.name}` },
        { status: 400 },
      );
    }
    if (!d.incentiveRule || d.incentiveRule.incentiveAmount == null) {
      return NextResponse.json(
        { error: `Incentive rule required for ${d.name}` },
        { status: 400 },
      );
    }
  }

  // Verify the branch belongs to this agent
  const branch = await prisma.branch.findFirst({
    where: { id: upload.branchId, agentId: session.user.id },
    select: { id: true },
  });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Create all dispatchers in a single transaction
  const createdCount = await prisma.$transaction(async (tx) => {
    // Idempotency: batch-check which (branchId, extId) assignments already
    // exist. DispatcherAssignment is the authoritative map post-Phase-B.
    const extIds = dispatchers.map((d) => d.extId.trim());
    const existingAssignments = await tx.dispatcherAssignment.findMany({
      where: { branchId: branch.id, extId: { in: extIds } },
      select: { extId: true },
    });
    const existingExtIds = new Set(existingAssignments.map((a) => a.extId));

    let count = 0;

    for (const d of dispatchers) {
      const extIdTrim = d.extId.trim();
      if (existingExtIds.has(extIdTrim)) continue; // idempotent

      const nameTrim = d.name.trim();
      const safeIcNo = d.icNo?.trim() ? d.icNo.trim() : null;
      const gender = safeIcNo ? deriveGender(safeIcNo) : "UNKNOWN" as const;

      const dispatcher = await tx.dispatcher.create({
        data: {
          agentId: session.user.id,
          name: nameTrim,
          normalizedName: normalizeName(nameTrim),
          extId: extIdTrim,
          icNo: safeIcNo,
          gender,
          branchId: branch.id,
        },
      });

      await tx.dispatcherAssignment.create({
        data: {
          dispatcherId: dispatcher.id,
          branchId: branch.id,
          extId: extIdTrim,
        },
      });

      await tx.weightTier.createMany({
        data: d.weightTiers.map((t) => ({
          dispatcherId: dispatcher.id,
          tier: t.tier,
          minWeight: t.minWeight,
          maxWeight: t.maxWeight,
          commission: t.commission,
        })),
      });

      await tx.incentiveRule.create({
        data: {
          dispatcherId: dispatcher.id,
          orderThreshold: d.incentiveRule.orderThreshold,
          incentiveAmount: d.incentiveRule.incentiveAmount,
        },
      });

      await tx.petrolRule.create({
        data: {
          dispatcherId: dispatcher.id,
          isEligible: d.petrolRule.isEligible,
          dailyThreshold: d.petrolRule.dailyThreshold,
          subsidyAmount: d.petrolRule.subsidyAmount,
        },
      });

      count++;
    }

    return count;
  });

  return NextResponse.json({ success: true, createdCount });
}
