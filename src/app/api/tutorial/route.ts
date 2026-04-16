import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Mark tutorial as seen for the current agent. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.agent.update({
    where: { id: session.user.id },
    data: { hasSeenTutorial: true },
  });

  return NextResponse.json({ success: true });
}

/** Reset tutorial (replay). */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.agent.update({
    where: { id: session.user.id },
    data: { hasSeenTutorial: false },
  });

  return NextResponse.json({ success: true });
}
