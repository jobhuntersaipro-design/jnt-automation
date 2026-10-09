import { notFound } from "next/navigation";
import { JournalExport } from "@/components/v2/accounting/journal-export";
import { getJournalRuns, getJournalSetup } from "@/lib/v2/accounting/data";
import { chosenPeriod } from "@/lib/v2/scope";
import { v2Owner } from "@/lib/v2/session";

/** The sidebar month's finalised payroll as a journal for the accounting software. Owner only. */
export default async function JournalPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Owner();
  if (!s) notFound();
  const period = await chosenPeriod(s.agentId, (await searchParams).month);
  const [setup, { runs, drafts }] = await Promise.all([getJournalSetup(s.agentId), getJournalRuns(s.agentId, period)]);
  return <JournalExport key={period} period={period} setup={setup} runs={runs} drafts={drafts} />;
}
