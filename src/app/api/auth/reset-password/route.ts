import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resetPasswordLimiter, extractIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = extractIp((await headers()).get("x-forwarded-for"));
  const { success } = await resetPasswordLimiter.limit(ip);
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

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

  if (password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters." },
      { status: 400 }
    );
  }

  // Hash the incoming token to compare against stored hash
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  // Atomic delete — if the token doesn't exist, it was already used or never existed
  let record: { expires: Date };
  try {
    record = await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token: hashedToken } },
      select: { expires: true },
    });
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "This reset link is invalid or has already been used." },
        { status: 400 }
      );
    }
    throw err;
  }

  if (record.expires < new Date()) {
    return NextResponse.json(
      { error: "Reset link has expired. Please request a new one." },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.agent.update({
    where: { email },
    data: { password: hashedPassword },
  });

  return NextResponse.json({ message: "Password reset successfully." });
}