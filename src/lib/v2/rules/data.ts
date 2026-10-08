import { prisma } from "@/lib/prisma";
import { parseConfig, type Employment, type Kind, type RuleConfig } from "@/lib/v2/pay/config";

// Read models for the v2 rule screens. Every query is scoped by agentId.

export interface VersionView {
  id: string;
  effectiveFrom: number;
  config: RuleConfig;
  createdAt: string;
  createdBy: string | null;
  source: string | null;
}

export interface AssignmentView {
  id: string;
  branchId: string | null;
  branchCode: string | null;
  dispatcherId: string | null;
  dispatcherName: string | null;
  employment: Employment | null;
  effectiveFrom: number;
}

export interface RuleView {
  id: string;
  kind: Kind;
  name: string;
  /** Newest month first. */
  versions: VersionView[];
  assignments: AssignmentView[];
}

const include = {
  versions: { orderBy: { effectiveFrom: "desc" as const } },
  assignments: {
    orderBy: { effectiveFrom: "asc" as const },
    include: { branch: { select: { code: true } }, dispatcher: { select: { name: true } } },
  },
};

type RuleRow = NonNullable<Awaited<ReturnType<typeof findRule>>>;
const findRule = (agentId: string, id: string) => prisma.payRule.findFirst({ where: { id, agentId, archivedAt: null }, include });

function toView(rule: RuleRow): RuleView {
  return {
    id: rule.id,
    kind: rule.kind,
    name: rule.name,
    versions: rule.versions.flatMap((v) => {
      const config = parseConfig(v.config);
      if (!config) console.error(`[v2 rules] version ${v.id} has an invalid config; hidden`);
      return config
        ? [{ id: v.id, effectiveFrom: v.effectiveFrom, config, createdAt: v.createdAt.toISOString(), createdBy: v.createdBy, source: v.source }]
        : [];
    }),
    assignments: rule.assignments.map((a) => ({
      id: a.id,
      branchId: a.branchId,
      branchCode: a.branch?.code ?? null,
      dispatcherId: a.dispatcherId,
      dispatcherName: a.dispatcher?.name ?? null,
      employment: a.employment,
      effectiveFrom: a.effectiveFrom,
    })),
  };
}

export async function listRules(agentId: string): Promise<RuleView[]> {
  const rules = await prisma.payRule.findMany({ where: { agentId, archivedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }], include });
  return rules.map(toView);
}

export async function getRule(agentId: string, id: string): Promise<RuleView | null> {
  const rule = await findRule(agentId, id);
  return rule ? toView(rule) : null;
}

/** Outlets = the account's real (non-sample) branches. */
export function listOutlets(agentId: string) {
  return prisma.branch.findMany({ where: { agentId, isDemo: false }, select: { id: true, code: true }, orderBy: { code: "asc" } });
}

export function listDispatcherOptions(agentId: string) {
  return prisma.dispatcher.findMany({
    where: { agentId, branch: { isDemo: false } },
    select: { id: true, name: true, extId: true },
    orderBy: { name: "asc" },
  });
}

export async function listAudit(agentId: string, ruleId: string) {
  const rows = await prisma.ruleAudit.findMany({ where: { agentId, ruleId }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => ({ id: r.id, action: r.action, detail: (r.detail ?? {}) as Record<string, string | number | null>, actor: r.actor, createdAt: r.createdAt.toISOString() }));
}
export type AuditView = Awaited<ReturnType<typeof listAudit>>[number];
