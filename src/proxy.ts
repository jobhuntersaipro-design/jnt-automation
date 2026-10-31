import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { agentOverdue } from "@/lib/overdue";

const { auth } = NextAuth(authConfig);

const READS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Writes an overdue account may still make: paying, signing in and out, Billplz and cron. */
const OPEN_WHILE_OVERDUE = ["/api/auth/", "/api/billing/", "/api/cron/", "/api/settings/invoices/"];

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/") || READS.has(req.method)) return;
  if (OPEN_WHILE_OVERDUE.some((p) => pathname.startsWith(p))) return;
  const user = req.auth?.user;
  // Superadmins (also while viewing as an account) are never blocked.
  if (!user?.id || user.isSuperAdmin) return;
  if (await agentOverdue(user.id)) {
    return NextResponse.json(
      { error: "Your account is overdue. Pay your invoice in Settings → Plan & billing first." },
      { status: 402 },
    );
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/dispatchers/:path*", "/staff/:path*", "/payroll/:path*", "/upload/:path*", "/settings/:path*", "/admin/:path*", "/branches/:path*", "/app/:path*", "/api/:path*"],
};
