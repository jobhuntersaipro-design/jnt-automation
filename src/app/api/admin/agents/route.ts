import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAllAgents, createAgent } from "@/lib/db/admin";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agents = await getAllAgents();
  return NextResponse.json(agents);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { email, name, password, isApproved, maxBranches, companyRegistrationNo, companyAddress } = body;

  if (!email || !name || !password) {
    return NextResponse.json({ error: "Email, name, and password are required" }, { status: 400 });
  }

  if (password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Password must be 8-128 characters" }, { status: 400 });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const agent = await createAgent({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      password: hashedPassword,
      isApproved: isApproved ?? true,
      maxBranches: maxBranches ?? 1,
      companyRegistrationNo: companyRegistrationNo?.trim() || undefined,
      companyAddress: companyAddress?.trim() || undefined,
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    throw error;
  }
}
