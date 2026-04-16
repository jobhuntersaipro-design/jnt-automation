import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPaymentRecords, createPaymentRecord } from "@/lib/db/admin";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  const records = await getPaymentRecords(agentId);
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { agentId, amount, date, notes, period } = body;

  if (!agentId || typeof amount !== "number" || !date) {
    return NextResponse.json({ error: "agentId, amount, and date are required" }, { status: 400 });
  }

  const record = await createPaymentRecord({
    agentId,
    amount,
    date: new Date(date),
    notes: notes || undefined,
    period: period || undefined,
  });

  return NextResponse.json(record);
}
