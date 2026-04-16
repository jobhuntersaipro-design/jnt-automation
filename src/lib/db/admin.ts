import { prisma } from "@/lib/prisma";

// Get all agents with branch counts and payment records
export async function getAllAgents() {
  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      isApproved: true,
      isSuperAdmin: true,
      maxBranches: true,
      avatarUrl: true,
      createdAt: true,
      _count: { select: { branches: true } },
      branches: { select: { code: true }, orderBy: { code: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    isApproved: a.isApproved,
    isSuperAdmin: a.isSuperAdmin,
    maxBranches: a.maxBranches,
    avatarUrl: a.avatarUrl,
    createdAt: a.createdAt.toISOString(),
    branchCount: a._count.branches,
    branches: a.branches.map((b) => b.code),
  }));
}

export type AdminAgent = Awaited<ReturnType<typeof getAllAgents>>[number];

// Get payment records for an agent
export async function getPaymentRecords(agentId: string) {
  return prisma.paymentRecord.findMany({
    where: { agentId },
    orderBy: { date: "desc" },
  });
}

// Toggle agent approval
export async function toggleAgentApproval(agentId: string, isApproved: boolean) {
  return prisma.agent.update({
    where: { id: agentId },
    data: { isApproved },
    select: { id: true, isApproved: true },
  });
}

// Update agent maxBranches
export async function updateMaxBranches(agentId: string, maxBranches: number) {
  return prisma.agent.update({
    where: { id: agentId },
    data: { maxBranches },
    select: { id: true, maxBranches: true },
  });
}

// Create a payment record
export async function createPaymentRecord(data: {
  agentId: string;
  amount: number;
  date: Date;
  notes?: string;
  period?: string;
}) {
  return prisma.paymentRecord.create({ data });
}

// Delete a payment record
export async function deletePaymentRecord(id: string) {
  return prisma.paymentRecord.delete({ where: { id } });
}

// Create a new agent account
export async function createAgent(data: {
  email: string;
  name: string;
  password: string;
  isApproved: boolean;
  maxBranches: number;
  companyRegistrationNo?: string;
  companyAddress?: string;
}) {
  return prisma.agent.create({
    data,
    select: { id: true, email: true, name: true },
  });
}

// Add a branch to an agent
export async function addBranchToAgent(agentId: string, code: string) {
  return prisma.branch.create({
    data: { agentId, code },
    select: { id: true, code: true },
  });
}

// Delete a branch (cascades dispatchers, uploads, etc.)
export async function deleteBranch(branchId: string) {
  return prisma.branch.delete({ where: { id: branchId } });
}

// Get full agent details for superadmin view
export async function getAgentView(agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      email: true,
      isApproved: true,
      maxBranches: true,
      companyRegistrationNo: true,
      companyAddress: true,
      stampImageUrl: true,
      createdAt: true,
      branches: {
        select: {
          id: true,
          code: true,
          _count: { select: { dispatchers: true, uploads: true } },
        },
        orderBy: { code: "asc" },
      },
    },
  });

  if (!agent) return null;

  // Get summary stats
  const salaryAgg = await prisma.salaryRecord.aggregate({
    where: { dispatcher: { branch: { agentId } } },
    _sum: { netSalary: true, baseSalary: true, incentive: true, petrolSubsidy: true, penalty: true, advance: true },
    _count: true,
  });

  // Get dispatchers with basic info
  const dispatchers = await prisma.dispatcher.findMany({
    where: { branch: { agentId } },
    select: {
      id: true,
      name: true,
      extId: true,
      icNo: true,
      gender: true,
      branch: { select: { code: true } },
      _count: { select: { salaryRecords: true } },
    },
    orderBy: { name: "asc" },
  });

  // Get payroll history
  const uploads = await prisma.upload.findMany({
    where: { branch: { agentId }, status: "SAVED" },
    select: {
      id: true,
      month: true,
      year: true,
      branch: { select: { code: true } },
      _count: { select: { salaryRecords: true } },
      salaryRecords: {
        select: { netSalary: true },
      },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return {
    agent: {
      ...agent,
      createdAt: agent.createdAt.toISOString(),
    },
    summary: {
      totalNetSalary: salaryAgg._sum.netSalary ?? 0,
      totalBaseSalary: salaryAgg._sum.baseSalary ?? 0,
      totalIncentive: salaryAgg._sum.incentive ?? 0,
      totalPetrol: salaryAgg._sum.petrolSubsidy ?? 0,
      totalPenalty: salaryAgg._sum.penalty ?? 0,
      totalAdvance: salaryAgg._sum.advance ?? 0,
      recordCount: salaryAgg._count,
    },
    branches: agent.branches.map((b) => ({
      id: b.id,
      code: b.code,
      dispatcherCount: b._count.dispatchers,
      uploadCount: b._count.uploads,
    })),
    dispatchers: dispatchers.map((d) => ({
      id: d.id,
      name: d.name,
      extId: d.extId,
      icNo: d.icNo ? `****${d.icNo.slice(-4)}` : "",
      gender: d.gender,
      branchCode: d.branch.code,
      salaryRecordCount: d._count.salaryRecords,
    })),
    payroll: uploads.map((u) => ({
      uploadId: u.id,
      branchCode: u.branch.code,
      month: u.month,
      year: u.year,
      dispatcherCount: u._count.salaryRecords,
      totalNetPayout: u.salaryRecords.reduce((s, r) => s + r.netSalary, 0),
    })),
  };
}

export type AgentView = NonNullable<Awaited<ReturnType<typeof getAgentView>>>;
