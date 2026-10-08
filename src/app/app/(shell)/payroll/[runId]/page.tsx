import { notFound } from "next/navigation";
import { RunReview } from "@/components/v2/payroll/run-review";
import { getRunView } from "@/lib/v2/payroll/data";
import { v2Session } from "@/lib/v2/session";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const run = await getRunView(s.agentId, (await params).runId);
  if (!run) notFound();
  return <RunReview run={run} />;
}
