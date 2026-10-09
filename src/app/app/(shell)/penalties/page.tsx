import { notFound } from "next/navigation";
import { Penalties } from "@/components/v2/penalties/penalties";
import { getPenaltyMonth, listPersonOptions } from "@/lib/v2/penalties/data";
import { chosenPeriod } from "@/lib/v2/scope";
import { v2Session } from "@/lib/v2/session";

export default async function PenaltiesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const period = await chosenPeriod(s.agentId, (await searchParams).month);
  const [data, people] = await Promise.all([getPenaltyMonth(s.agentId, period), listPersonOptions(s.agentId)]);
  return <Penalties key={period} data={data} people={people} />;
}
