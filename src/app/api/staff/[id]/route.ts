import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify dispatcher belongs to this agent
  const dispatcher = await prisma.dispatcher.findFirst({
    where: { id, branch: { agentId: session.user.id } },
    select: { id: true },
  });

  if (!dispatcher) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.dispatcher.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
