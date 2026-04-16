import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { deletePaymentRecord } from "@/lib/db/admin";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentId } = await params;

  try {
    await deletePaymentRecord(paymentId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
  }
}
