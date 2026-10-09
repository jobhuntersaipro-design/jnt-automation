import { notFound } from "next/navigation";
import { DispatcherList } from "@/components/v2/people/dispatcher-list";
import { listDispatcherRows } from "@/lib/v2/people/data";
import { chosenOutlet, chosenPeriod } from "@/lib/v2/scope";
import { v2Session } from "@/lib/v2/session";

export default async function DispatchersPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const [period, outlet] = await Promise.all([chosenPeriod(s.agentId, (await searchParams).month), chosenOutlet()]);
  const rows = await listDispatcherRows(s.agentId, period);
  const shown = outlet && rows.some((r) => r.outlets.includes(outlet)) ? rows.filter((r) => r.outlets.includes(outlet)) : rows;
  // Keyed by month and outlet, so picks and selections from another month don't carry over.
  return <DispatcherList key={`${period}-${outlet}`} rows={shown} period={period} />;
}
