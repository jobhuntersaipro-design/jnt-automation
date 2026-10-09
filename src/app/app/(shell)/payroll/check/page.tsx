import { notFound } from "next/navigation";
import { Check } from "@/components/v2/payroll/check";
import { getCheckView } from "@/lib/v2/payroll/check";
import { chosenPeriod } from "@/lib/v2/scope";
import { v2Session } from "@/lib/v2/session";

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const period = await chosenPeriod(s.agentId, (await searchParams).month);
  return <Check key={period} view={await getCheckView(s.agentId, period)} />;
}
