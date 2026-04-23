import { NextRequest, NextResponse } from "next/server";
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { recalculateBodySchema } from "@/lib/validations/staff";
import { readBonusTierSnapshot } from "@/lib/staff/bonus-tier-snapshot";

interface TierSnapshot {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface PetrolSnapshot {
  isEligible: boolean;
  dailyThreshold: number;
  subsidyAmount: number;
}

function commissionFor(weight: number, tiers: TierSnapshot[]): number {
  const tier = tiers.find(
    (t) =>
      weight >= t.minWeight &&
      (t.maxWeight === null || weight <= t.maxWeight),
  );
  return tier?.commission ?? 0;
}

export async function POST(
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

    const dispatcher = await prisma.dispatcher.findFirst({
      where: { id, branch: { agentId } },
      select: { id: true },
    });

    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const raw = await req.json();
    const parsed = recalculateBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { salaryRecordId, updatedSnapshot, adjustments } = parsed.data;

    const record = await prisma.salaryRecord.findFirst({
      where: { id: salaryRecordId, dispatcherId: id },
      select: {
        id: true,
        commission: true,
        penalty: true,
        advance: true,
        weightTiersSnapshot: true,
        bonusTierSnapshot: true,
        petrolSnapshot: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Salary record not found" }, { status: 404 });
    }

    // Include waybillNumber so we can reproduce the calculator's stable sort
    // tiebreaker. Otherwise two parcels with the same deliveryDate could land
    // on different sides of the threshold each time the user recalculates.
    const lineItems = await prisma.salaryLineItem.findMany({
      where: { salaryRecordId },
      select: { id: true, waybillNumber: true, weight: true, deliveryDate: true },
    });

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "Cannot recalculate — line items missing" },
        { status: 400 },
      );
    }

    const weightTiers: TierSnapshot[] =
      updatedSnapshot.weightTiers ??
      (record.weightTiersSnapshot as TierSnapshot[] | null) ??
      [];

    // Bonus tiers + threshold — may come from the PATCH body or need to
    // be recovered from the stored snapshot. Legacy snapshots have no tiers
    // and require the client to supply them before we can recalculate.
    const prevBonusTier = readBonusTierSnapshot(record.bonusTierSnapshot);
    const orderThreshold =
      updatedSnapshot.bonusTierEarnings?.orderThreshold ??
      prevBonusTier?.orderThreshold ??
      2000;
    const bonusTiers: TierSnapshot[] =
      updatedSnapshot.bonusTiers ?? prevBonusTier?.tiers ?? [];

    if (bonusTiers.length === 0) {
      return NextResponse.json(
        {
          error:
            "Cannot recalculate — this record pre-dates the bonusTierEarnings tier feature. Supply bonusTiers in the request body.",
        },
        { status: 400 },
      );
    }

    const petrol: PetrolSnapshot =
      updatedSnapshot.petrol ??
      (record.petrolSnapshot as PetrolSnapshot | null) ??
      { isEligible: false, dailyThreshold: 70, subsidyAmount: 15 };

    // Stable sort — deliveryDate asc (null last), then waybillNumber asc
    const sorted = [...lineItems].sort((a, b) => {
      const aT = a.deliveryDate ? a.deliveryDate.getTime() : Number.POSITIVE_INFINITY;
      const bT = b.deliveryDate ? b.deliveryDate.getTime() : Number.POSITIVE_INFINITY;
      if (aT !== bT) return aT - bT;
      return a.waybillNumber.localeCompare(b.waybillNumber);
    });

    let baseSalary = 0;
    let bonusTierEarnings = 0;
    const updates: { id: string; commission: number; isBonusTier: boolean }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const li = sorted[i];
      // orderThreshold === 0 means bonus tier is disabled in the drawer UI —
      // treat every parcel as base tier. Without this guard the `i >= 0` check
      // would flag every parcel as bonus, inverting the toggle's intent.
      const isBonusTier = orderThreshold > 0 && i >= orderThreshold;
      const commission = commissionFor(
        li.weight,
        isBonusTier ? bonusTiers : weightTiers,
      );
      if (isBonusTier) bonusTierEarnings += commission;
      else baseSalary += commission;
      updates.push({ id: li.id, commission, isBonusTier });
    }

    const totalOrders = sorted.length;

    let petrolSubsidy = 0;
    if (petrol.isEligible) {
      const byDate = new Map<string, number>();
      for (const li of sorted) {
        if (li.deliveryDate) {
          const key = li.deliveryDate.toISOString().slice(0, 10);
          byDate.set(key, (byDate.get(key) ?? 0) + 1);
        }
      }
      for (const count of byDate.values()) {
        if (count >= petrol.dailyThreshold) {
          petrolSubsidy += petrol.subsidyAmount;
        }
      }
    }

    // Resolve effective adjustment values — client-supplied overrides (each
    // optional) fall back to the record's existing values so the drawer can
    // send only the fields the user actually changed.
    const effectiveCommission = adjustments?.commission ?? record.commission;
    const effectivePenalty = adjustments?.penalty ?? record.penalty;
    const effectiveAdvance = adjustments?.advance ?? record.advance;

    const netSalary =
      baseSalary +
      bonusTierEarnings +
      petrolSubsidy +
      effectiveCommission -
      effectivePenalty -
      effectiveAdvance;

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Bucket line items by (commission, isBonusTier) so we can issue one
    // updateMany per bucket instead of N sequential updates. A dispatcher has
    // at most 3 weight tiers × 2 (base/bonus) = 6 distinct buckets, so this
    // collapses an 8000-row update to ~6 round trips. The previous per-row
    // loop reliably timed out the 30s transaction on Neon.
    const buckets = new Map<string, { commission: number; isBonusTier: boolean; ids: string[] }>();
    for (const u of updates) {
      const key = `${u.commission}|${u.isBonusTier}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { commission: u.commission, isBonusTier: u.isBonusTier, ids: [] };
        buckets.set(key, bucket);
      }
      bucket.ids.push(u.id);
    }

    await prisma.$transaction(async (tx) => {
      await tx.salaryRecord.update({
        where: { id: salaryRecordId },
        data: {
          baseSalary: round2(baseSalary),
          totalOrders,
          bonusTierEarnings: round2(bonusTierEarnings),
          petrolSubsidy: round2(petrolSubsidy),
          commission: round2(effectiveCommission),
          penalty: round2(effectivePenalty),
          advance: round2(effectiveAdvance),
          netSalary: round2(netSalary),
          weightTiersSnapshot: weightTiers as unknown as InputJsonValue,
          bonusTierSnapshot: {
            orderThreshold,
            tiers: bonusTiers,
          } as unknown as InputJsonValue,
          petrolSnapshot: petrol as unknown as InputJsonValue,
        },
      });

      for (const bucket of buckets.values()) {
        await tx.salaryLineItem.updateMany({
          where: { id: { in: bucket.ids } },
          data: { commission: bucket.commission, isBonusTier: bucket.isBonusTier },
        });
      }
    }, { timeout: 30_000 });

    return NextResponse.json({ success: true, updatedNetSalary: round2(netSalary) });
  } catch (err) {
    console.error("[staff/recalculate] POST error", err);
    const dev = process.env.NODE_ENV !== "production";
    const message =
      dev && err instanceof Error ? `Internal server error: ${err.message}` : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
