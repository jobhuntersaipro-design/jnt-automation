import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/db/notifications";
import { repriceSalary } from "@/lib/payroll/re-price";

// Only penalty/advance/commission are trusted from the client. totalOrders /
// baseSalary / bonusTierEarnings / petrolSubsidy are re-derived server-side
// from SalaryLineItem rows against the dispatcher's CURRENT rules — rate
// changes in settings must flow through on save.
const UpdateEntrySchema = z.object({
  dispatcherId: z.string().min(1),
  commission: z.number().min(0).max(100_000),
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
        bonusTiers: { orderBy: { tier: "asc" } },
        petrolRule: true,
      },
    });
    const dispatcherMap = new Map(dispatchers.map((d) => [d.id, d]));

    // Pre-load existing SalaryRecord ids + line items for every dispatcher in
    // this batch so the transaction can re-price without a second round-trip.
    const salaryRecords = await prisma.salaryRecord.findMany({
      where: { uploadId, dispatcherId: { in: dispatcherIds } },
      select: {
        id: true,
        dispatcherId: true,
        lineItems: {
          select: {
            id: true,
            waybillNumber: true,
            weight: true,
            deliveryDate: true,
            isBonusTier: true,
            commission: true,
          },
        },
      },
    });
    const recordByDispatcher = new Map(
      salaryRecords.map((r) => [r.dispatcherId, r]),
    );

    await prisma.$transaction(async (tx) => {
      await Promise.all(updates.map(async (update) => {
        const dispatcher = dispatcherMap.get(update.dispatcherId);
        const record = recordByDispatcher.get(update.dispatcherId);
        if (!dispatcher || !record) return;

        const weightTiers = dispatcher.weightTiers.map((t) => ({
          tier: t.tier,
          minWeight: t.minWeight,
          maxWeight: t.maxWeight,
          commission: t.commission,
        }));
        const bonusTiers = dispatcher.bonusTiers.map((t) => ({
          tier: t.tier,
          minWeight: t.minWeight,
          maxWeight: t.maxWeight,
          commission: t.commission,
        }));
        const orderThreshold = dispatcher.incentiveRule?.orderThreshold ?? 0;
        const petrolRule = dispatcher.petrolRule ?? {
          isEligible: false,
          dailyThreshold: 70,
          subsidyAmount: 15,
        };

        // Re-price line items in-memory against current rules.
        const repriced = repriceSalary(
          record.lineItems.map((li) => ({
            waybillNumber: li.waybillNumber,
            weight: li.weight,
            deliveryDate: li.deliveryDate,
            isBonusTier: li.isBonusTier,
          })),
          weightTiers,
          bonusTiers,
          orderThreshold,
          petrolRule,
        );

        // If any line item changed commission or flag, delete all + createMany.
        // A single dispatcher can have thousands of line items so doing per-row
        // Prisma updates in an interactive transaction overwhelms the connection
        // pool. Delete + bulk insert is two queries regardless of row count.
        // Skip entirely when nothing changed.
        const anyChanged = record.lineItems.some(
          (orig, i) =>
            orig.commission !== repriced.items[i].commission ||
            orig.isBonusTier !== repriced.items[i].isBonusTier,
        );
        if (anyChanged) {
          await tx.salaryLineItem.deleteMany({ where: { salaryRecordId: record.id } });
          await tx.salaryLineItem.createMany({
            data: record.lineItems.map((orig, i) => ({
              salaryRecordId: record.id,
              waybillNumber: orig.waybillNumber,
              weight: orig.weight,
              commission: repriced.items[i].commission,
              isBonusTier: repriced.items[i].isBonusTier,
              deliveryDate: orig.deliveryDate,
            })),
          });
        }

        const netSalary =
          repriced.baseSalary +
          repriced.bonusTierEarnings +
          repriced.petrolSubsidy +
          update.commission -
          update.penalty -
          update.advance;

        await tx.salaryRecord.update({
          where: { id: record.id },
          data: {
            totalOrders: record.lineItems.length,
            baseSalary: repriced.baseSalary,
            bonusTierEarnings: repriced.bonusTierEarnings,
            petrolSubsidy: repriced.petrolSubsidy,
            petrolQualifyingDays: repriced.petrolQualifyingDays,
            commission: update.commission,
            penalty: update.penalty,
            advance: update.advance,
            netSalary: Math.round(netSalary * 100) / 100,
            weightTiersSnapshot: weightTiers,
            bonusTierSnapshot: dispatcher.incentiveRule
              ? { orderThreshold, tiers: bonusTiers }
              : undefined,
            petrolSnapshot: dispatcher.petrolRule
              ? {
                  isEligible: petrolRule.isEligible,
                  dailyThreshold: petrolRule.dailyThreshold,
                  subsidyAmount: petrolRule.subsidyAmount,
                }
              : undefined,
          },
        });
      }));
    }, { timeout: 60000 });

    revalidatePath("/dispatchers");
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
