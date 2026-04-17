import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";

export async function PATCH(
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
      select: { isPinned: true },
    });

    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.dispatcher.update({
      where: { id },
      data: { isPinned: !dispatcher.isPinned },
      select: { isPinned: true },
    });

    return NextResponse.json({ isPinned: updated.isPinned });
  } catch (err) {
    console.error("[staff/pin] PATCH error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
