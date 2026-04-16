import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getNotifications, markAllRead, clearAll } from "@/lib/db/notifications";

// GET — fetch notifications for the current agent
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await getNotifications(session.user.id);
  return NextResponse.json(notifications);
}

// PATCH — mark all as read
export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markAllRead(session.user.id);
  return NextResponse.json({ success: true });
}

// DELETE — clear all notifications
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await clearAll(session.user.id);
  return NextResponse.json({ success: true });
}
