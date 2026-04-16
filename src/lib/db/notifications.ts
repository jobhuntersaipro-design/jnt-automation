import { prisma } from "@/lib/prisma";

export async function createNotification(data: {
  agentId: string;
  type: "upload" | "payroll" | "new_dispatcher" | "recalculate";
  message: string;
  detail: string;
}) {
  return prisma.notification.create({ data });
}

export async function getNotifications(agentId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      message: true,
      detail: true,
      isRead: true,
      createdAt: true,
    },
  });
}

export async function getUnreadCount(agentId: string) {
  return prisma.notification.count({
    where: { agentId, isRead: false },
  });
}

export async function markAllRead(agentId: string) {
  return prisma.notification.updateMany({
    where: { agentId, isRead: false },
    data: { isRead: true },
  });
}

export async function clearAll(agentId: string) {
  return prisma.notification.deleteMany({
    where: { agentId },
  });
}
