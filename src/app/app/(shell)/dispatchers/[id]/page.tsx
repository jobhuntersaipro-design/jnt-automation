import { notFound } from "next/navigation";
import { DispatcherDetail, type ResolvedView } from "@/components/v2/people/dispatcher-detail";
import { listPersonOptions } from "@/lib/v2/penalties/data";
import { getDispatcher, listAssignments, listRuleOptions, penaltyTypesIn, ratesFrom } from "@/lib/v2/people/data";
import { inForce, periodFromParam, periodOf, pickAssignments } from "@/lib/v2/pay/resolve";
import { dispatcherScope, v2Session } from "@/lib/v2/session";

export default async function DispatcherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; outlet?: string }>;
}) {
  const s = await v2Session();
  if (!s) notFound();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const period = periodFromParam(query.month) ?? periodOf(new Date());
  const [dispatcher, assignments, ruleOptions, penaltyTypes, people] = await Promise.all([
    getDispatcher(s.agentId, id, dispatcherScope(s)),
    listAssignments(s.agentId),
    listRuleOptions(s.agentId),
    penaltyTypesIn(s.agentId, period),
    s.member ? Promise.resolve([]) : listPersonOptions(s.agentId),
  ]);
  if (!dispatcher) notFound();
  const others = people.filter((p) => p.id !== dispatcher.id);
  const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();

  // Pay is worked out per outlet run; show the outlet asked for, else the first one.
  const outletId = dispatcher.outlets.find((o) => o.id === query.outlet)?.id ?? dispatcher.outlets[0].id;
  const profile = inForce(dispatcher.profiles, period);
  // As in a payroll run: each penalty type picks its own rule.
  const slotOf = (a: (typeof assignments)[number]) => (a.kind === "PENALTY" ? `PENALTY:${penaltyTypes.get(a.ruleId) ?? a.ruleId}` : a.kind);
  const picked = pickAssignments(assignments, { period, branchId: outletId, dispatcherId: dispatcher.id, employment: profile?.employment ?? null }, slotOf);
  const resolved: ResolvedView[] = [...picked.values()].map((a) => ({
    kind: a.kind,
    penalty: penaltyTypes.get(a.ruleId) ?? null,
    ruleId: a.ruleId,
    ruleName: a.ruleName,
    self: a.dispatcherId !== null,
    branchCode: a.branchCode,
    employment: a.employment,
    effectiveFrom: a.effectiveFrom,
    hasRates: ratesFrom(a, period) !== null,
  }));
  const overrides = assignments
    .filter((a) => a.dispatcherId === dispatcher.id)
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom)
    .map((a) => ({ id: a.id, ruleName: a.ruleName, kind: a.kind, effectiveFrom: a.effectiveFrom }));

  return (
    <DispatcherDetail
      key={`${period}:${outletId}`}
      dispatcher={dispatcher}
      profiles={dispatcher.profiles}
      period={period}
      outletId={outletId}
      hasProfile={profile !== null}
      resolved={resolved}
      overrides={overrides}
      ruleOptions={ruleOptions}
      others={others}
      owner={!s.member}
      suggested={others.filter((p) => nameKey(p.name) === nameKey(dispatcher.name))}
    />
  );
}
