import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { getStaffDispatcherById } from "@/lib/db/staff";

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
    const dispatcher = await getStaffDispatcherById(effective.agentId, id);
    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ dispatcher });
  } catch (err) {
    console.error("[staff] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
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

    // Verify dispatcher belongs to this agent
    const dispatcher = await prisma.dispatcher.findFirst({
      where: { id, branch: { agentId } },
      select: { id: true },
    });

    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Cascade delete in a transaction to prevent orphaned data
    await prisma.$transaction(async (tx) => {
      const salaryRecords = await tx.salaryRecord.findMany({
        where: { dispatcherId: id },
        select: { id: true },
      });
      if (salaryRecords.length > 0) {
        const recordIds = salaryRecords.map((r) => r.id);
        await tx.salaryLineItem.deleteMany({ where: { salaryRecordId: { in: recordIds } } });
        await tx.salaryRecord.deleteMany({ where: { dispatcherId: id } });
      }
      await tx.dispatcher.delete({ where: { id } });
    });

    revalidateTag("overview", { expire: 0 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[staff] DELETE error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
