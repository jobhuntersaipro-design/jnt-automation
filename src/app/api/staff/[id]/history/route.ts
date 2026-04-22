import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify dispatcher belongs to this agent (or impersonated agent)
    const dispatcher = await prisma.dispatcher.findFirst({
      where: { id, branch: { agentId: effective.agentId } },
      select: { id: true },
    });

    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const records = await prisma.salaryRecord.findMany({
      where: { dispatcherId: id },
      select: {
        id: true,
        uploadId: true,
        month: true,
        year: true,
        netSalary: true,
        baseSalary: true,
        incentive: true,
        petrolSubsidy: true,
        petrolQualifyingDays: true,
        penalty: true,
        advance: true,
        totalOrders: true,
        weightTiersSnapshot: true,
        incentiveSnapshot: true,
        petrolSnapshot: true,
        createdAt: true,
        updatedAt: true,
        upload: { select: { branch: { select: { code: true } } } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    const history = records.map((r) => ({
      salaryRecordId: r.id,
      uploadId: r.uploadId,
      month: r.month,
      year: r.year,
      branchCode: r.upload.branch.code,
      netSalary: r.netSalary,
      baseSalary: r.baseSalary,
      incentive: r.incentive,
      petrolSubsidy: r.petrolSubsidy,
      petrolQualifyingDays: r.petrolQualifyingDays,
      penalty: r.penalty,
      advance: r.advance,
      totalOrders: r.totalOrders,
      wasRecalculated: r.updatedAt.getTime() > r.createdAt.getTime() + 1000,
      weightTiersSnapshot: r.weightTiersSnapshot,
      incentiveSnapshot: r.incentiveSnapshot,
      petrolSnapshot: r.petrolSnapshot,
    }));

    return NextResponse.json(history);
  } catch (err) {
    console.error("[staff/history] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
