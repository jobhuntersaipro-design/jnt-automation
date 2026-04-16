import { cookies } from "next/headers";
import { auth } from "@/auth";

const IMPERSONATE_COOKIE = "impersonate-agent-id";

/**
 * Get the effective agentId for data queries.
 * If the current user is a superadmin with an active impersonation session,
 * returns the impersonated agentId. Otherwise returns the real session agentId.
 */
export async function getEffectiveAgentId(): Promise<{
  agentId: string;
  impersonating: boolean;
  impersonatedName?: string;
} | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) return null;

  const jar = await cookies();
  const impersonateId = jar.get(IMPERSONATE_COOKIE)?.value;

  if (impersonateId && session.user.isSuperAdmin) {
    // Verify the target agent exists
    const { prisma } = await import("@/lib/prisma");
    const target = await prisma.agent.findUnique({
      where: { id: impersonateId },
      select: { id: true, name: true },
    });
    if (target) {
      return { agentId: target.id, impersonating: true, impersonatedName: target.name };
    }
  }

  return { agentId: session.user.id, impersonating: false };
}

/**
 * Set impersonation cookie (superadmin only).
 */
export async function setImpersonation(agentId: string) {
  const jar = await cookies();
  jar.set(IMPERSONATE_COOKIE, agentId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours
  });
}

/**
 * Clear impersonation cookie.
 */
export async function clearImpersonation() {
  const jar = await cookies();
  jar.delete(IMPERSONATE_COOKIE);
}
