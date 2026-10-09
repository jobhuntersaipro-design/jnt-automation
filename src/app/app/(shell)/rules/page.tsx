import { notFound } from "next/navigation";
import { RulesList } from "@/components/v2/rules/rules-list";
import { chosenPeriod } from "@/lib/v2/scope";
import { listRules } from "@/lib/v2/rules/data";
import { v2Owner } from "@/lib/v2/session";

export default async function RulesPage() {
  const s = await v2Owner();
  if (!s) notFound();
  // New rules start in the sidebar's month (else the payroll month worked on last), so an older month's file isn't left uncovered.
  const startMonth = await chosenPeriod(s.agentId);
  return <RulesList rules={await listRules(s.agentId)} thisMonth={startMonth} />;
}
