import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email: rawEmail, token: rawToken, password } = body as {
    email?: string;
    token?: string;
    password?: string;
  };

  if (!rawEmail || !rawToken || !password) {
    return NextResponse.json(
      { error: "Email, token, and password are required." },
      { status: 400 }
    );
  }

  const email = rawEmail.trim().toLowerCase();

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // Hash the incoming token to compare against stored hash
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  // Find and validate token
  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token: hashedToken } },
  });

  if (!record) {
    return NextResponse.json(
      { error: "Invalid or expired reset link." },
      { status: 400 }
    );
  }

  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token: hashedToken } },
    });
    return NextResponse.json(
      { error: "Reset link has expired. Please request a new one." },
      { status: 400 }
    );
  }

  // Update password and delete token
  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.agent.update({
    where: { email },
    data: { password: hashedPassword },
  });

  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: email, token: hashedToken } },
  });

  return NextResponse.json({ message: "Password reset successfully." });
}
