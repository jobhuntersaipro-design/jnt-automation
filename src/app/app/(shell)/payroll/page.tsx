import { notFound } from "next/navigation";
import { Runs } from "@/components/v2/payroll/runs";
import { listRuns } from "@/lib/v2/payroll/data";
import { v2Session } from "@/lib/v2/session";

export default async function PayrollPage() {
  const s = await v2Session();
  if (!s) notFound();
  return <Runs runs={await listRuns(s.agentId)} />;
}
