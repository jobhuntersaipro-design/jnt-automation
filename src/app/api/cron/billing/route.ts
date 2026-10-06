import { NextRequest, NextResponse } from "next/server";
import { runBillingJob } from "@/lib/invoice-billing";

export const maxDuration = 300;

// Vercel Cron (vercel.json) — daily: send invoices once trials end, remind on the due date.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runBillingJob();
  console.log("[billing] daily job", result);
  return NextResponse.json(result);
}
