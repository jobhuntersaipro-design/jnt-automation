import { notFound } from "next/navigation";
import { SuccessRates } from "@/components/v2/success/success-rates";
import { chosenPeriod } from "@/lib/v2/scope";
import { v2Session } from "@/lib/v2/session";
import { getSuccessMonth } from "@/lib/v2/success/data";

/** The sidebar month's delivery success rates, from J&T's report, for success-rate bonus rules. */
export default async function SuccessRatesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const period = await chosenPeriod(s.agentId, (await searchParams).month);
  return <SuccessRates key={period} data={await getSuccessMonth(s, period)} />;
}
