import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.isApproved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { code } = body as { code?: string };

    if (!code?.trim()) {
      return NextResponse.json({ error: "Branch code is required" }, { status: 400 });
    }

    const trimmedCode = code.trim().toUpperCase();

    if (trimmedCode.length > 20) {
      return NextResponse.json({ error: "Branch code must be 20 characters or fewer" }, { status: 400 });
    }

    // Check if branch already exists for this agent
    const existing = await prisma.branch.findFirst({
      where: { agentId: session.user.id, code: trimmedCode },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Branch already exists" }, { status: 409 });
    }

    // Check branch limit
    const agent = await prisma.agent.findUnique({
      where: { id: session.user.id },
      select: { maxBranches: true },
    });

    const branchCount = await prisma.branch.count({
      where: { agentId: session.user.id },
    });

    if (agent && branchCount >= agent.maxBranches) {
      return NextResponse.json({ error: `Branch limit reached (${agent.maxBranches})` }, { status: 403 });
    }

    const branch = await prisma.branch.create({
      data: { agentId: session.user.id, code: trimmedCode },
      select: { id: true, code: true },
    });

    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    console.error("[branches] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
