import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { addBranchToAgent } from "@/lib/db/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;
  const { code } = await req.json();

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Branch code is required" }, { status: 400 });
  }

  try {
    const branch = await addBranchToAgent(agentId, code.trim().toUpperCase());
    return NextResponse.json(branch, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "This branch code already exists for this agent" }, { status: 409 });
    }
    throw error;
  }
}
