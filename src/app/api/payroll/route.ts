import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPayrollHistory } from "@/lib/db/payroll";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const history = await getPayrollHistory(session.user.id);
  return NextResponse.json(history);
}
