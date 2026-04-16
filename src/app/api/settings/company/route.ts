import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  companyRegistrationNo: z.string().max(50).nullish(),
  companyAddress: z.string().max(500).nullish(),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.isApproved) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { companyRegistrationNo, companyAddress } = parsed.data;
  const data: { companyRegistrationNo?: string | null; companyAddress?: string | null } = {};
  if (companyRegistrationNo !== undefined) data.companyRegistrationNo = companyRegistrationNo;
  if (companyAddress !== undefined) data.companyAddress = companyAddress;

  await prisma.agent.update({
    where: { id: session.user.id },
    data,
  });

  return NextResponse.json({ success: true });
}
