import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendNewSignupNotification } from "@/lib/email";
import { normalizePhone } from "@/lib/billing";
import { registerLimiter, extractIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = extractIp((await headers()).get("x-forwarded-for"));
  const { success } = await registerLimiter.limit(ip);
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

  const { name: rawName, email: rawEmail, phone: rawPhone, password, confirmPassword } = body as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    confirmPassword?: string;
  };

  const name = rawName?.trim();
  const email = rawEmail?.trim().toLowerCase();

  // Validation
  if (!name || !email || !password || !confirmPassword) {
    return NextResponse.json(
      { error: "Name, email, password, and confirmPassword are required." },
      { status: 400 }
    );
  }

  const phone = typeof rawPhone === "string" ? normalizePhone(rawPhone) : null;
  if (!phone) {
    return NextResponse.json(
      { error: "Please enter a valid WhatsApp number." },
      { status: 400 }
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format." },
      { status: 400 }
    );
  }

  if (password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters." },
      { status: 400 }
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords do not match." },
      { status: 400 }
    );
  }

  // Check for existing email — return same success shape to prevent enumeration
  const existing = await prisma.agent.findUnique({ where: { email } });
  if (existing) {
    await bcrypt.hash(password, 12); // equalize timing with real registration path
    return NextResponse.json(
      { message: "Registration successful." },
      { status: 201 }
    );
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.agent.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        isApproved: true,
        isSuperAdmin: false,
      },
    });

    await sendNewSignupNotification(email, name, "email", phone);

    return NextResponse.json(
      { message: "Registration successful." },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
