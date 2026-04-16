import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.redirect(new URL("/auth/login", baseUrl));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  // Verify and consume the nonce
  const storedNonce = await redis.get<string>(`oauth-state:${session.user.id}`);
  await redis.del(`oauth-state:${session.user.id}`);

  if (!code || !state || !storedNonce || state !== storedNonce) {
    return NextResponse.redirect(
      new URL("/payroll?error=google_sheets_failed", baseUrl),
    );
  }

  const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET!;
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ||
    `${baseUrl}/api/auth/google-sheets/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(
        new URL("/payroll?error=google_sheets_failed", baseUrl),
      );
    }

    const tokens = await tokenRes.json();

    await prisma.agent.update({
      where: { id: session.user.id },
      data: {
        googleSheetsAccessToken: tokens.access_token,
        googleSheetsRefreshToken: tokens.refresh_token ?? undefined,
        googleSheetsTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return NextResponse.redirect(
      new URL("/payroll?google_sheets=connected", baseUrl),
    );
  } catch (error) {
    console.error("Google Sheets OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/payroll?error=google_sheets_failed", baseUrl),
    );
  }
}
