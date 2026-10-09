import { notFound } from "next/navigation";
import { Advances } from "@/components/v2/advances/advances";
import { getAdvanceMonth } from "@/lib/v2/advances/data";
import { listPersonOptions } from "@/lib/v2/penalties/data";
import { chosenPeriod } from "@/lib/v2/scope";
import { v2Session } from "@/lib/v2/session";

export default async function AdvancesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const period = await chosenPeriod(s.agentId, (await searchParams).month);
  const [data, people] = await Promise.all([getAdvanceMonth(s.agentId, period), listPersonOptions(s.agentId)]);
  return <Advances key={period} data={data} people={people} />;
}
