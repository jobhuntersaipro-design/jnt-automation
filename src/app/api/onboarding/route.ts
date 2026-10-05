import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { removeDemoData } from "@/lib/demo/seed";

/** POST /api/onboarding — mark the product tour as seen. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.agent.update({
    where: { id: session.user.id },
    data: { hasSeenTutorial: true },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/onboarding — remove the onboarding sample data. */
export async function DELETE() {
  const effective = await getEffectiveAgentId();
  if (!effective) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await removeDemoData(effective.agentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[onboarding] demo removal failed", err);
    return NextResponse.json({ error: "Failed to remove sample data" }, { status: 500 });
  }
}
