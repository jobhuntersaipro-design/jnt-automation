import { notFound } from "next/navigation";
import { RuleEditor } from "@/components/v2/rules/rule-editor";
import { periodOf } from "@/lib/v2/pay/resolve";
import { getRule, listAudit, listDispatcherOptions, listOutlets } from "@/lib/v2/rules/data";
import { v2Session } from "@/lib/v2/session";

export default async function RulePage({ params, searchParams }: { params: Promise<{ ruleId: string }>; searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const [{ ruleId }, { month }] = await Promise.all([params, searchParams]);
  const rule = await getRule(s.agentId, ruleId);
  if (!rule || rule.versions.length === 0) notFound();
  const [outlets, dispatchers, audit] = await Promise.all([listOutlets(s.agentId), listDispatcherOptions(s.agentId), listAudit(s.agentId, rule.id)]);
  const version = rule.versions.find((v) => v.effectiveFrom === Number(month)) ?? rule.versions[0];
  // Keyed by version, so switching versions (or saving one) starts the editor from its numbers.
  return (
    <RuleEditor
      key={`${version.id}:${version.createdAt}`}
      rule={rule}
      version={version}
      outlets={outlets}
      dispatchers={dispatchers}
      audit={audit}
      thisMonth={periodOf(new Date())}
    />
  );
}
