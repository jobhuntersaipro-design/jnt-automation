import { notFound } from "next/navigation";
import { RulesList } from "@/components/v2/rules/rules-list";
import { periodOf } from "@/lib/v2/pay/resolve";
import { listRules } from "@/lib/v2/rules/data";
import { v2Session } from "@/lib/v2/session";

export default async function RulesPage() {
  const s = await v2Session();
  if (!s) notFound();
  return <RulesList rules={await listRules(s.agentId)} thisMonth={periodOf(new Date())} />;
}
