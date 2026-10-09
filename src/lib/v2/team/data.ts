import { prisma } from "@/lib/prisma";

export interface TeamMemberView {
  id: string;
  name: string;
  email: string;
  branchIds: string[];
  /** Set a password from the invite (or signed in some other way). */
  joined: boolean;
}

export async function listTeam(agentId: string): Promise<TeamMemberView[]> {
  const rows = await prisma.agent.findMany({
    where: { ownerId: agentId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, teamBranchIds: true, password: true, _count: { select: { accounts: true } } },
  });
  return rows.map((m) => ({ id: m.id, name: m.name, email: m.email, branchIds: m.teamBranchIds, joined: m.password !== null || m._count.accounts > 0 }));
}
