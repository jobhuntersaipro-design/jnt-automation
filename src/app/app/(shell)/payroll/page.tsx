import { notFound } from "next/navigation";
import { Runs } from "@/components/v2/payroll/runs";
import { listRuns } from "@/lib/v2/payroll/data";
import { chosenOutlet } from "@/lib/v2/scope";
import { v2Session } from "@/lib/v2/session";

export default async function PayrollPage() {
  const s = await v2Session();
  if (!s) notFound();
  const [runs, outlet] = await Promise.all([listRuns(s.agentId), chosenOutlet()]);
  // Every month stays listed; the sidebar's outlet narrows the list when that outlet has runs.
  const shown = outlet && runs.some((r) => r.outlet === outlet) ? runs.filter((r) => r.outlet === outlet) : runs;
  return <Runs runs={shown} />;
}
