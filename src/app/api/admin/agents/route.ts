import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAllAgents, createAgent } from "@/lib/db/admin";
import bcrypt from "bcryptjs";
import { z } from "zod";

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

  const inputSchema = z.object({
    email: z.string().email("Invalid email address").max(255),
    name: z.string().min(1, "Name is required").max(200),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
  });
  const validated = inputSchema.safeParse({ email, name, password });
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.issues[0].message }, { status: 400 });
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
