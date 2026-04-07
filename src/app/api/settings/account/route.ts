import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cascade delete handles branches, dispatchers, salary records, etc.
  await prisma.agent.delete({
    where: { id: session.user.id },
  });

  return NextResponse.json({ message: "Account deleted." });
}
