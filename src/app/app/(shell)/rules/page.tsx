import { notFound } from "next/navigation";
import { RulesList } from "@/components/v2/rules/rules-list";
import { periodOf } from "@/lib/v2/pay/resolve";
import { lastWorkedPeriod } from "@/lib/v2/payroll/data";
import { listRules } from "@/lib/v2/rules/data";
import { v2Owner } from "@/lib/v2/session";

export default async function RulesPage() {
  const s = await v2Owner();
  if (!s) notFound();
  // New rules start in the payroll month being worked on, so an older month's file isn't left uncovered.
  const startMonth = (await lastWorkedPeriod(s.agentId)) ?? periodOf(new Date());
  return <RulesList rules={await listRules(s.agentId)} thisMonth={startMonth} />;
}
