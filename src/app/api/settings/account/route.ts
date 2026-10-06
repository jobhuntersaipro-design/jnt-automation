import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteAgent } from "@/lib/db/admin";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteAgent(session.user.id);

  return NextResponse.json({ message: "Account deleted." });
}
