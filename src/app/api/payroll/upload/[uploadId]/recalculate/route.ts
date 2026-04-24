import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/db/notifications";
import { repriceSalary } from "@/lib/payroll/re-price";
import {
  bucketLineItemChanges,
  rulesMatchSnapshot,
} from "@/lib/payroll/re-price-helpers";
import { runPool } from "@/lib/upload/run-pool";

export const maxDuration = 120;

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

const POOL_CONCURRENCY = 4;
const PER_DISPATCHER_TX_TIMEOUT_MS = 20_000;

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
    const dispatcherIds = updates.map((u) => u.dispatcherId);

    // Agent-scoped dispatcher lookup — doubles as IDOR guard: anything not in
    // the result is silently skipped downstream.
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

    // NOTE: no `include: { lineItems }` here — pulling every line item for
    // every dispatcher at once blew the Vercel memory + tx timeout. Load them
    // per-dispatcher inside the pool, and only when we can't short-circuit.
    const salaryRecords = await prisma.salaryRecord.findMany({
      where: { uploadId, dispatcherId: { in: dispatcherIds } },
      select: {
        id: true,
        dispatcherId: true,
        commission: true,
        penalty: true,
        advance: true,
        weightTiersSnapshot: true,
        bonusTierSnapshot: true,
        petrolSnapshot: true,
      },
    });
    const recordByDispatcher = new Map(salaryRecords.map((r) => [r.dispatcherId, r]));

    await runPool(updates, POOL_CONCURRENCY, async (update) => {
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
      const petrolForReprice = {
        isEligible: petrolRule.isEligible,
        dailyThreshold: petrolRule.dailyThreshold,
        subsidyAmount: petrolRule.subsidyAmount,
      };

      // No-op short-circuit: if current rules exactly match the stored
      // snapshot AND the client hasn't changed commission/penalty/advance,
      // there is literally nothing to do for this dispatcher.
      const summaryUnchanged =
        update.commission === record.commission &&
        update.penalty === record.penalty &&
        update.advance === record.advance;

      if (
        summaryUnchanged &&
        rulesMatchSnapshot(
          { weightTiers, bonusTiers, orderThreshold, petrol: petrolForReprice },
          {
            weightTiersSnapshot: record.weightTiersSnapshot,
            bonusTierSnapshot: record.bonusTierSnapshot,
            petrolSnapshot: record.petrolSnapshot,
          },
        )
      ) {
        return;
      }

      // Load this dispatcher's line items (only for dispatchers that
      // actually need repricing or a summary write).
      const lineItems = await prisma.salaryLineItem.findMany({
        where: { salaryRecordId: record.id },
        select: {
          id: true,
          waybillNumber: true,
          weight: true,
          deliveryDate: true,
          isBonusTier: true,
          commission: true,
        },
      });

      const repriced = repriceSalary(
        lineItems.map((li) => ({
          waybillNumber: li.waybillNumber,
          weight: li.weight,
          deliveryDate: li.deliveryDate,
          isBonusTier: li.isBonusTier,
        })),
        weightTiers,
        bonusTiers,
        orderThreshold,
        petrolForReprice,
      );

      const buckets = bucketLineItemChanges(lineItems, repriced.items);

      const netSalary =
        repriced.baseSalary +
        repriced.bonusTierEarnings +
        repriced.petrolSubsidy +
        update.commission -
        update.penalty -
        update.advance;

      // Per-dispatcher short transaction — bounded work, bounded time,
      // recoverable on failure.
      await prisma.$transaction(
        async (tx) => {
          for (const bucket of buckets) {
            await tx.salaryLineItem.updateMany({
              where: { id: { in: bucket.ids } },
              data: { commission: bucket.commission, isBonusTier: bucket.isBonusTier },
            });
          }

          await tx.salaryRecord.update({
            where: { id: record.id },
            data: {
              totalOrders: lineItems.length,
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
        },
        { timeout: PER_DISPATCHER_TX_TIMEOUT_MS },
      );
    });

    revalidatePath("/dispatchers");
    revalidatePath("/dashboard");

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
