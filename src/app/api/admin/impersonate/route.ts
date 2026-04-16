import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { setImpersonation, clearImpersonation } from "@/lib/impersonation";

// POST — start impersonation
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await req.json();
  if (!agentId || typeof agentId !== "string") {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  await setImpersonation(agentId);
  return NextResponse.json({ success: true });
}

// DELETE — stop impersonation
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await clearImpersonation();
  return NextResponse.json({ success: true });
}
