import { auth } from "@/auth";
import { getV2Agent, type V2Member } from "@/lib/ui-version";
import type { MessageKey } from "@/lib/i18n/en";

export interface V2Session {
  /** The account whose data is read and written (the owner's, for a team member). */
  agentId: string;
  /** Email of the person signed in (an admin's when viewing as the account), for the audit log. */
  actor: string | null;
  /** Set for a branch supervisor: only `branchIds`, and no finalising, rules or account settings. */
  member: V2Member | null;
}

/**
 * Who is acting in v2. Null for v1 accounts and signed-out visitors; v2 actions and routes must refuse then.
 */
export async function v2Session(): Promise<V2Session | null> {
  const v2 = await getV2Agent();
  if (!v2) return null;
  const session = await auth();
  return { agentId: v2.agentId, actor: session?.user?.email ?? null, member: v2.member };
}

/** The account owner only (not a supervisor): rules, branches, settings, finalising. */
export async function v2Owner(): Promise<V2Session | null> {
  const s = await v2Session();
  return s && !s.member ? s : null;
}

/** Whether this session may see or change a branch's payroll. */
export const canBranch = (s: V2Session, branchId: string) => !s.member || s.member.branchIds.includes(branchId);

/** Prisma filter on a branch id column for this session; undefined = every branch. */
export const branchIn = (s: V2Session) => (s.member ? { in: s.member.branchIds } : undefined);

/** Prisma filter for dispatchers this session may see: assigned to one of its branches. */
export const dispatcherScope = (s: V2Session) => (s.member ? { assignments: { some: { branchId: { in: s.member.branchIds } } } } : {});

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: MessageKey; vars?: Record<string, string | number> };

/** Prisma filter for penalty cases this session may see: matched to one of its dispatchers, or naming one of its branches. */
export async function penaltyScope(s: V2Session) {
  if (!s.member) return {};
  const { prisma } = await import("@/lib/prisma");
  const codes = await prisma.branch.findMany({ where: { agentId: s.agentId, id: { in: s.member.branchIds } }, select: { code: true } });
  return { OR: [{ dispatcher: dispatcherScope(s) }, { dispatcherId: null, outlet: { in: codes.map((b) => b.code) } }] };
}
