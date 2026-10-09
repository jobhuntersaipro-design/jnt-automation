import { notFound } from "next/navigation";
import { MonthClose } from "@/components/v2/payroll/month-close";
import { Runs } from "@/components/v2/payroll/runs";
import { listRuns } from "@/lib/v2/payroll/data";
import { getMonthClose } from "@/lib/v2/payroll/month";
import { chosenOutlet, chosenPeriod } from "@/lib/v2/scope";
import { v2Session } from "@/lib/v2/session";
import ui from "@/components/v2/ui.module.css";

/** Month close for the sidebar's month, then every run. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const [period, chosen] = await Promise.all([chosenPeriod(s.agentId, (await searchParams).month), chosenOutlet()]);
  // getMonthClose works stale drafts out again, so it runs before the run list reads their totals.
  const all = await getMonthClose(s.agentId, period, null);
  const outlet = chosen && all.some((r) => r.branch === chosen) ? chosen : null;
  const runs = await listRuns(s.agentId);
  return (
    <div className={ui.page}>
      <MonthClose period={period} outlet={outlet} rows={outlet ? all.filter((r) => r.branch === outlet) : all} />
      <Runs runs={outlet ? runs.filter((r) => r.outlet === outlet) : runs} />
    </div>
  );
}
