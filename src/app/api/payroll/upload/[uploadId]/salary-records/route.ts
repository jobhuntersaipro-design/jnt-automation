import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSalaryRecordsByUpload } from "@/lib/db/payroll";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;
  const data = await getSalaryRecordsByUpload(uploadId, session.user.id);

  if (!data) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
