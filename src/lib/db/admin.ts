import { prisma } from "@/lib/prisma";

// Get all agents with branches, contact details and invoices
export async function getAllAgents() {
  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      adminNotes: true,
      isApproved: true,
      isSuperAdmin: true,
      maxBranches: true,
      avatarUrl: true,
      createdAt: true,
      branches: { select: { code: true, isDemo: true }, orderBy: { code: "asc" } },
      invoices: {
        select: { year: true, month: true, amount: true, branchCount: true, sentAt: true, paidAt: true },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      },
      branchLimitChanges: {
        select: { fromLimit: true, toLimit: true, changedBy: true, actorEmail: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    adminNotes: a.adminNotes,
    isApproved: a.isApproved,
    isSuperAdmin: a.isSuperAdmin,
    maxBranches: a.maxBranches,
    avatarUrl: a.avatarUrl,
    createdAt: a.createdAt.toISOString(),
    branchCount: a.branches.filter((b) => !b.isDemo).length,
    branches: a.branches.filter((b) => !b.isDemo).map((b) => b.code),
    hasDemo: a.branches.some((b) => b.isDemo),
    limitChanges: a.branchLimitChanges.map((c) => ({
      fromLimit: c.fromLimit,
      toLimit: c.toLimit,
      changedBy: c.changedBy as "agent" | "admin",
      actorEmail: c.actorEmail,
      createdAt: c.createdAt.toISOString(),
    })),
    invoices: a.invoices.map((i) => ({
      year: i.year,
      month: i.month,
      amount: i.amount,
      branchCount: i.branchCount,
      sentAt: i.sentAt?.toISOString() ?? null,
      paidAt: i.paidAt?.toISOString() ?? null,
    })),
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

// Toggle agent approval — sends welcome email when approving
export async function toggleAgentApproval(agentId: string, isApproved: boolean) {
  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: { isApproved },
    select: { id: true, isApproved: true, email: true, name: true },
  });

  if (isApproved) {
    const { sendApprovalEmail } = await import("@/lib/email");
    sendApprovalEmail(agent.email, agent.name).catch((err) => {
      console.error("Failed to send approval email:", err);
    });
  }

  return { id: agent.id, isApproved: agent.isApproved };
}

export type LimitActor = { changedBy: "agent" | "admin"; actorEmail: string | null };

/**
 * Set an agent's branch limit and log the change. Returns the previous
 * limit, or null when nothing changed (no log row is written).
 */
export async function setBranchLimit(agentId: string, toLimit: number, actor: LimitActor) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.agent.findUniqueOrThrow({ where: { id: agentId }, select: { maxBranches: true } });
    if (current.maxBranches === toLimit) return null;
    await tx.agent.update({ where: { id: agentId }, data: { maxBranches: toLimit } });
    await tx.branchLimitChange.create({
      data: { agentId, fromLimit: current.maxBranches, toLimit, ...actor },
    });
    return current.maxBranches;
  });
}

// Update the admin-editable profile fields; branch-limit changes are logged.
export async function updateAgentProfile(
  agentId: string,
  data: { name?: string; phone?: string | null; adminNotes?: string | null; maxBranches?: number },
  actor: LimitActor,
) {
  const { maxBranches, ...rest } = data;
  if (maxBranches !== undefined) await setBranchLimit(agentId, maxBranches, actor);
  return prisma.agent.update({
    where: { id: agentId },
    data: rest,
    select: { id: true, name: true, phone: true, adminNotes: true, maxBranches: true },
  });
}

// Delete an agent and everything they own (all relations cascade)
export async function deleteAgent(agentId: string) {
  return prisma.agent.delete({ where: { id: agentId } });
}

// ─── Invoices ──────────────────────────────────────────────

const INVOICE_AGENT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isSuperAdmin: true,
  maxBranches: true,
  companyRegistrationNo: true,
  companyAddress: true,
  createdAt: true,
} as const;

export async function getInvoiceAgent(agentId: string) {
  return prisma.agent.findUnique({ where: { id: agentId }, select: INVOICE_AGENT_SELECT });
}

export async function getInvoice(agentId: string, year: number, month: number) {
  return prisma.invoice.findUnique({ where: { agentId_year_month: { agentId, year, month } } });
}

/**
 * Create or refresh a month's invoice. An unpaid invoice re-snapshots the
 * branch limit; a paid one keeps the amount it was paid at.
 */
export async function upsertInvoice(
  agentId: string,
  year: number,
  month: number,
  branchCount: number,
  unitPrice: number,
  patch: { sentAt?: Date; paidAt?: Date | null },
) {
  const existing = await getInvoice(agentId, year, month);
  const pricing = existing?.paidAt && patch.paidAt !== null
    ? {}
    : { branchCount, unitPrice, amount: branchCount * unitPrice };
  return prisma.invoice.upsert({
    where: { agentId_year_month: { agentId, year, month } },
    create: { agentId, year, month, branchCount, unitPrice, amount: branchCount * unitPrice, ...patch },
    update: { ...pricing, ...patch },
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
  phone?: string;
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
    _sum: { netSalary: true, baseSalary: true, bonusTierEarnings: true, petrolSubsidy: true, penalty: true, advance: true },
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
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  // Aggregate net salary per upload in a single query instead of loading all records
  const uploadIds = uploads.map((u) => u.id);
  const uploadSums = uploadIds.length > 0
    ? await prisma.salaryRecord.groupBy({
        by: ["uploadId"],
        where: { uploadId: { in: uploadIds } },
        _sum: { netSalary: true },
      })
    : [];
  const uploadNetMap = new Map(uploadSums.map((r) => [r.uploadId, r._sum.netSalary ?? 0]));

  return {
    agent: {
      ...agent,
      createdAt: agent.createdAt.toISOString(),
    },
    summary: {
      totalNetSalary: salaryAgg._sum.netSalary ?? 0,
      totalBaseSalary: salaryAgg._sum.baseSalary ?? 0,
      totalBonusTierEarnings: salaryAgg._sum.bonusTierEarnings ?? 0,
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
      totalNetPayout: uploadNetMap.get(u.id) ?? 0,
    })),
  };
}

export type AgentView = NonNullable<Awaited<ReturnType<typeof getAgentView>>>;
