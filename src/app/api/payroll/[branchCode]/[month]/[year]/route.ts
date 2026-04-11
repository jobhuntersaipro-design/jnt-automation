import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUploadState } from "@/lib/db/payroll";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ branchCode: string; month: string; year: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchCode, month: monthStr, year: yearStr } = await params;
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);

  if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
    return NextResponse.json({ error: "Invalid month or year" }, { status: 400 });
  }

  const upload = await getUploadState(session.user.id, branchCode, month, year);

  if (!upload) {
    return NextResponse.json({ upload: null, status: "NONE" });
  }

  return NextResponse.json({ upload, status: upload.status });
}
