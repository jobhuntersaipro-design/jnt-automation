import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { lastWorkedPeriod } from "@/lib/v2/payroll/data";
import { periodFromParam, periodOf, type Period } from "@/lib/v2/pay/resolve";
import type { V2Session } from "@/lib/v2/session";

// The month and outlet chosen in the sidebar, kept across Payroll, Penalties and Dispatchers.
export const MONTH_COOKIE = "es-month";
export const OUTLET_COOKIE = "es-outlet";

/** `?month=` first (links into a month), then the sidebar's choice, then the month worked on last, then this month. */
export async function chosenPeriod(agentId: string, param?: string | string[]): Promise<Period> {
  return (
    periodFromParam(param) ??
    periodFromParam((await cookies()).get(MONTH_COOKIE)?.value) ??
    (await lastWorkedPeriod(agentId)) ??
    periodOf(new Date())
  );
}

/**
 * The outlet code chosen in the sidebar, or null for all outlets. Callers ignore codes the account doesn't have.
 * A branch supervisor always has one of their own branches (never "all", which would include others').
 */
export async function chosenOutlet(s?: Pick<V2Session, "agentId" | "member"> | null): Promise<string | null> {
  const picked = (await cookies()).get(OUTLET_COOKIE)?.value || null;
  if (!s?.member) return picked;
  const mine = (await memberBranches(s.agentId, s.member.branchIds)).map((b) => b.code);
  return picked && mine.includes(picked) ? picked : (mine[0] ?? "-");
}

/** A supervisor's branches, in code order. */
export function memberBranches(agentId: string, branchIds: string[]) {
  return prisma.branch.findMany({ where: { agentId, id: { in: branchIds } }, select: { id: true, code: true }, orderBy: { code: "asc" } });
}
