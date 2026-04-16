import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/db/notifications";

const UpdateEntrySchema = z.object({
  dispatcherId: z.string().min(1),
  totalOrders: z.number().int().min(0).max(100_000),
  baseSalary: z.number().min(0).max(1_000_000),
  incentive: z.number().min(0).max(100_000),
  petrolSubsidy: z.number().min(0).max(100_000),
  penalty: z.number().min(0).max(100_000),
  advance: z.number().min(0).max(100_000),
});

const BodySchema = z.object({
  updates: z.array(UpdateEntrySchema).min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await verifyUploadOwnership(uploadId, effective.agentId);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "SAVED") {
    return NextResponse.json(
      { error: `Cannot recalculate in ${upload.status} state` },
      { status: 409 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { updates } = parsed.data;

  try {
    // Batch-load all dispatchers with agent scope (fixes N+1 + IDOR)
    const dispatcherIds = updates.map((u) => u.dispatcherId);
    const dispatchers = await prisma.dispatcher.findMany({
      where: {
        id: { in: dispatcherIds },
        branch: { agentId: effective.agentId },
      },
      include: {
        weightTiers: { orderBy: { tier: "asc" } },
        incentiveRule: true,
        petrolRule: true,
      },
    });
    const dispatcherMap = new Map(dispatchers.map((d) => [d.id, d]));

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        const dispatcher = dispatcherMap.get(update.dispatcherId);
        if (!dispatcher) continue;

        const netSalary =
          update.baseSalary +
          update.incentive +
          update.petrolSubsidy -
          update.penalty -
          update.advance;

        await tx.salaryRecord.update({
          where: {
            dispatcherId_uploadId: {
              dispatcherId: update.dispatcherId,
              uploadId,
            },
          },
          data: {
            totalOrders: update.totalOrders,
            baseSalary: update.baseSalary,
            incentive: update.incentive,
            petrolSubsidy: update.petrolSubsidy,
            penalty: update.penalty,
            advance: update.advance,
            netSalary,
            weightTiersSnapshot: dispatcher.weightTiers.map((t) => ({
              tier: t.tier,
              minWeight: t.minWeight,
              maxWeight: t.maxWeight,
              commission: t.commission,
            })),
            incentiveSnapshot: dispatcher.incentiveRule
              ? {
                  orderThreshold: dispatcher.incentiveRule.orderThreshold,
                  incentiveAmount: dispatcher.incentiveRule.incentiveAmount,
                }
              : undefined,
            petrolSnapshot: dispatcher.petrolRule
              ? {
                  isEligible: dispatcher.petrolRule.isEligible,
                  dailyThreshold: dispatcher.petrolRule.dailyThreshold,
                  subsidyAmount: dispatcher.petrolRule.subsidyAmount,
                }
              : undefined,
          },
        });
      }
    }, { timeout: 30000 });

    revalidatePath("/payroll");
    revalidatePath("/dashboard");

    // Notify
    await createNotification({
      agentId: effective.agentId,
      type: "recalculate",
      message: "Payroll recalculated",
      detail: `${updates.length} record${updates.length > 1 ? "s" : ""} updated`,
    }).catch(() => {});

    return NextResponse.json({ success: true, updatedCount: updates.length });
  } catch (error) {
    console.error("Failed to recalculate payroll:", error);
    return NextResponse.json(
      { error: "Failed to save changes. Please try again." },
      { status: 500 },
    );
  }
}
