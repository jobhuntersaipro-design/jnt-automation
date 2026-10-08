import { prisma } from "@/lib/prisma";
import { parseConfig, penaltyTypeOf, type Employment, type Kind, type PenaltyType, type Vehicle } from "@/lib/v2/pay/config";
import { inForce, type AssignmentRow, type Period } from "@/lib/v2/pay/resolve";

// Read models for the v2 outlet and dispatcher screens. Every query is scoped by agentId;
// sample (demo) branches and their people are left out.

export interface ProfileView {
  id: string;
  effectiveFrom: Period;
  vehicle: Vehicle;
  employment: Employment;
}

const profileSelect = { id: true, effectiveFrom: true, vehicle: true, employment: true } as const;

export interface OutletView {
  id: string;
  code: string;
  dispatchers: number;
  /** Rules given to this outlet (not to one dispatcher there). */
  rules: { ruleId: string; ruleName: string; kind: Kind; employment: Employment | null; effectiveFrom: Period }[];
}

export async function listOutletViews(agentId: string): Promise<OutletView[]> {
  const outlets = await prisma.branch.findMany({
    where: { agentId, isDemo: false },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      _count: { select: { assignments: true } },
      payRuleAssignments: {
        where: { dispatcherId: null, rule: { archivedAt: null } },
        orderBy: [{ kind: "asc" }, { effectiveFrom: "asc" }],
        select: { kind: true, employment: true, effectiveFrom: true, rule: { select: { id: true, name: true } } },
      },
    },
  });
  return outlets.map((o) => ({
    id: o.id,
    code: o.code,
    dispatchers: o._count.assignments,
    rules: o.payRuleAssignments.map((a) => ({ ruleId: a.rule.id, ruleName: a.rule.name, kind: a.kind, employment: a.employment, effectiveFrom: a.effectiveFrom })),
  }));
}

export interface DispatcherRow {
  id: string;
  name: string;
  extId: string;
  outlets: string[];
  /** In force in the month shown; null = not set. */
  profile: ProfileView | null;
  /** The next change after the month shown. */
  next: ProfileView | null;
}

export async function listDispatcherRows(agentId: string, period: Period): Promise<DispatcherRow[]> {
  const rows = await prisma.dispatcher.findMany({
    where: { agentId, branch: { isDemo: false } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      extId: true,
      assignments: { orderBy: { startedAt: "asc" }, select: { branch: { select: { code: true } } } },
      profiles: { orderBy: { effectiveFrom: "asc" }, select: profileSelect },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    extId: d.extId,
    outlets: [...new Set(d.assignments.map((a) => a.branch.code))],
    profile: inForce(d.profiles, period),
    next: d.profiles.find((p) => p.effectiveFrom > period) ?? null,
  }));
}

export async function getDispatcher(agentId: string, id: string) {
  const d = await prisma.dispatcher.findFirst({
    where: { id, agentId, branch: { isDemo: false } },
    select: {
      id: true,
      name: true,
      extId: true,
      branch: { select: { id: true, code: true } },
      assignments: { orderBy: { startedAt: "asc" }, select: { extId: true, branch: { select: { id: true, code: true } } } },
      profiles: { orderBy: { effectiveFrom: "desc" }, select: profileSelect },
    },
  });
  if (!d) return null;
  const outlets = d.assignments.length ? d.assignments.map((a) => ({ id: a.branch.id, code: a.branch.code, extId: a.extId })) : [{ ...d.branch, extId: d.extId }];
  return { id: d.id, name: d.name, extId: d.extId, outlets, profiles: d.profiles as ProfileView[] };
}

export interface AssignmentInfo extends AssignmentRow {
  ruleName: string;
  branchCode: string | null;
  /** Months the rule has rates from. */
  versionMonths: Period[];
}

/** Every assignment of the account's live rules, ready for pickAssignments(). */
export async function listAssignments(agentId: string): Promise<AssignmentInfo[]> {
  const rows = await prisma.payRuleAssignment.findMany({
    where: { agentId, rule: { archivedAt: null } },
    select: {
      id: true,
      kind: true,
      ruleId: true,
      branchId: true,
      dispatcherId: true,
      employment: true,
      effectiveFrom: true,
      createdAt: true,
      branch: { select: { code: true } },
      rule: { select: { name: true, versions: { select: { effectiveFrom: true } } } },
    },
  });
  return rows.map(({ branch, rule, ...a }) => ({ ...a, ruleName: rule.name, branchCode: branch?.code ?? null, versionMonths: rule.versions.map((v) => v.effectiveFrom) }));
}

/** The month a rule's rates come from in `period`, or null when it has none yet. */
export const ratesFrom = (a: AssignmentInfo, period: Period) => inForce(a.versionMonths.map((effectiveFrom) => ({ effectiveFrom })), period)?.effectiveFrom ?? null;

/** The penalty type each penalty rule deducts in `period`: rules are picked per type, not per kind. */
export async function penaltyTypesIn(agentId: string, period: Period): Promise<Map<string, PenaltyType>> {
  const versions = await prisma.payRuleVersion.findMany({
    where: { rule: { agentId, kind: "PENALTY", archivedAt: null }, effectiveFrom: { lte: period } },
    orderBy: { effectiveFrom: "asc" },
    select: { ruleId: true, config: true },
  });
  const types = new Map<string, PenaltyType>();
  for (const v of versions) {
    const type = penaltyTypeOf(parseConfig(v.config)?.unit ?? "parcels");
    if (type) types.set(v.ruleId, type); // ascending, so the version in force wins
  }
  return types;
}

export function listRuleOptions(agentId: string) {
  return prisma.payRule.findMany({ where: { agentId, archivedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true } });
}
