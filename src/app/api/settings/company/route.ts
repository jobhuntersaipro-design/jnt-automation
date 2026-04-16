import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.isApproved) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { companyRegistrationNo, companyAddress } = body;

  if (
    companyRegistrationNo !== undefined &&
    companyRegistrationNo !== null &&
    typeof companyRegistrationNo !== "string"
  ) {
    return NextResponse.json({ error: "Invalid companyRegistrationNo" }, { status: 400 });
  }

  if (
    companyAddress !== undefined &&
    companyAddress !== null &&
    typeof companyAddress !== "string"
  ) {
    return NextResponse.json({ error: "Invalid companyAddress" }, { status: 400 });
  }

  const data: { companyRegistrationNo?: string | null; companyAddress?: string | null } = {};
  if (companyRegistrationNo !== undefined) data.companyRegistrationNo = companyRegistrationNo;
  if (companyAddress !== undefined) data.companyAddress = companyAddress;

  await prisma.agent.update({
    where: { id: session.user.id },
    data,
  });

  return NextResponse.json({ success: true });
}
