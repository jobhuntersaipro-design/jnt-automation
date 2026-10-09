import { prisma } from "@/lib/prisma";
import type { Period } from "@/lib/v2/pay/resolve";
import type { PayLine } from "@/lib/v2/payroll/calc";
import { SLOTS, type AccountMap, type JournalRun } from "./journal";

export interface JournalSetupView {
  accounts: AccountMap;
  taxRate: string;
  tracking: string;
}

/** Saved account codes, with every slot present (blank when not set). */
export async function getJournalSetup(agentId: string): Promise<JournalSetupView> {
  const row = await prisma.journalSetup.findUnique({ where: { agentId } });
  const saved = (row?.accounts ?? {}) as Partial<AccountMap>;
  const accounts = Object.fromEntries(SLOTS.map((s) => [s, { code: saved[s]?.code ?? "", name: saved[s]?.name ?? "" }])) as AccountMap;
  return { accounts, taxRate: row?.taxRate ?? "No Tax", tracking: row?.tracking ?? "" };
}

/** The month's finalised runs (the journal books only locked pay) and how many branches are still drafts. */
export async function getJournalRuns(agentId: string, period: Period): Promise<{ runs: JournalRun[]; drafts: string[] }> {
  const runs = await prisma.payrollRun.findMany({
    where: { agentId, period },
    select: { status: true, branch: { select: { code: true } }, results: { select: { lines: true } } },
  });
  return {
    runs: runs.filter((r) => r.status === "FINAL").map((r) => ({ branch: r.branch.code, lines: r.results.map((x) => x.lines as unknown as PayLine[]) })),
    drafts: runs.filter((r) => r.status !== "FINAL").map((r) => r.branch.code).sort(),
  };
}
