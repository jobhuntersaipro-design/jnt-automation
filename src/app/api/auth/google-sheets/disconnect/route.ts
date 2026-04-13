import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.agent.update({
    where: { id: session.user.id },
    data: {
      googleSheetsAccessToken: null,
      googleSheetsRefreshToken: null,
      googleSheetsTokenExpiry: null,
    },
  });

  return NextResponse.json({ success: true });
}
