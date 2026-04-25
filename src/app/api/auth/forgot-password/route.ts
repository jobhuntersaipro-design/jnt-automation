import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordLimiter, extractIp } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const ip = extractIp((await headers()).get("x-forwarded-for"));
  const { success } = await forgotPasswordLimiter.limit(ip);
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

  const { email: rawEmail } = body as { email?: string };

  if (!rawEmail) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();

  // Always return 200 to prevent email enumeration
  const agent = await prisma.agent.findUnique({ where: { email } });
  if (!agent) {
    return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
  }

  // Generate token — store hashed, send raw in email
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Delete any existing tokens for this email
  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  });

  await prisma.verificationToken.create({
    data: { identifier: email, token: hashedToken, expires },
  });

  // Send reset email with raw token
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

  await sendPasswordResetEmail(email, agent.name, resetUrl);

  return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
}
