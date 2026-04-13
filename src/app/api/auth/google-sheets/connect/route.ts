import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.redirect(new URL("/auth/login", baseUrl));
  }

  const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID;
  // Use the configured redirect URI, or derive from current origin for dev
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ||
    `${baseUrl}/api/auth/google-sheets/callback`;

  if (!clientId) {
    return NextResponse.redirect(
      new URL("/payroll?error=google_sheets_failed", baseUrl),
    );
  }

  const scopes = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state: session.user.id,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(url);
}
