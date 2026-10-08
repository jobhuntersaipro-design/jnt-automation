import { notFound } from "next/navigation";
import { DispatcherList } from "@/components/v2/people/dispatcher-list";
import { listDispatcherRows } from "@/lib/v2/people/data";
import { periodFromParam, periodOf } from "@/lib/v2/pay/resolve";
import { v2Session } from "@/lib/v2/session";

export default async function DispatchersPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const period = periodFromParam((await searchParams).month) ?? periodOf(new Date());
  // Keyed by month, so picks and selections from another month don't carry over.
  return <DispatcherList key={period} rows={await listDispatcherRows(s.agentId, period)} period={period} />;
}
