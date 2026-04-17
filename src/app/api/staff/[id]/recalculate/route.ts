import { NextRequest, NextResponse } from "next/server";
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { recalculateBodySchema } from "@/lib/validations/staff";

interface WeightTierSnapshot {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface IncentiveSnapshot {
  orderThreshold: number;
  incentiveAmount: number;
}

interface PetrolSnapshot {
  isEligible: boolean;
  dailyThreshold: number;
  subsidyAmount: number;
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

    // Verify dispatcher belongs to this agent
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
    const { salaryRecordId, updatedSnapshot } = parsed.data;

    // Verify salary record belongs to this dispatcher
    const record = await prisma.salaryRecord.findFirst({
      where: { id: salaryRecordId, dispatcherId: id },
      select: {
        id: true,
        penalty: true,
        advance: true,
        weightTiersSnapshot: true,
        incentiveSnapshot: true,
        petrolSnapshot: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "Salary record not found" }, { status: 404 });
    }

    // Load existing line items
    const lineItems = await prisma.salaryLineItem.findMany({
      where: { salaryRecordId },
      select: { weight: true, deliveryDate: true },
    });

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "Cannot recalculate — line items missing" },
        { status: 400 },
      );
    }

    // Merge snapshots: use updated values or fall back to existing snapshot
    const weightTiers: WeightTierSnapshot[] =
      updatedSnapshot.weightTiers ??
      (record.weightTiersSnapshot as WeightTierSnapshot[] | null) ??
      [];
    const incentive: IncentiveSnapshot =
      updatedSnapshot.incentive ??
      (record.incentiveSnapshot as IncentiveSnapshot | null) ??
      { orderThreshold: 2000, incentiveAmount: 0 };
    const petrol: PetrolSnapshot =
      updatedSnapshot.petrol ??
      (record.petrolSnapshot as PetrolSnapshot | null) ??
      { isEligible: false, dailyThreshold: 70, subsidyAmount: 15 };

    // Recalculate base salary from line items
    const baseSalary = lineItems.reduce((sum, li) => {
      const tier = weightTiers.find(
        (t) => li.weight >= t.minWeight && (t.maxWeight === null || li.weight <= t.maxWeight),
      );
      return sum + (tier?.commission ?? 0);
    }, 0);

    const totalOrders = lineItems.length;

    // Incentive
    const incentiveAmount =
      totalOrders >= incentive.orderThreshold ? incentive.incentiveAmount : 0;

    // Petrol subsidy — group by date
    let petrolSubsidy = 0;
    if (petrol.isEligible) {
      const byDate = new Map<string, number>();
      for (const li of lineItems) {
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

    const netSalary =
      baseSalary + incentiveAmount + petrolSubsidy - record.penalty - record.advance;

    // Update the salary record with new values and snapshots
    await prisma.salaryRecord.update({
      where: { id: salaryRecordId },
      data: {
        baseSalary,
        totalOrders,
        incentive: incentiveAmount,
        petrolSubsidy,
        netSalary,
        weightTiersSnapshot: weightTiers as unknown as InputJsonValue,
        incentiveSnapshot: incentive as unknown as InputJsonValue,
        petrolSnapshot: petrol as unknown as InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, updatedNetSalary: netSalary });
  } catch (err) {
    console.error("[staff/recalculate] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
