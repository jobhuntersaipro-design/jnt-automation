import { DEDUCTING } from "@/lib/v2/pay/engine";
import { ADVANCE, type PayLine } from "./calc";

// The dashboard's per-branch view of a month: what was paid, what it was made of, what came off. Pure.

export interface StatRun {
  branch: string;
  runId: string;
  status: string;
  parcels: number;
  results: { name: string; netCents: number; lines: PayLine[]; cases: number }[];
}

export interface BranchStat {
  branch: string;
  runId: string;
  status: string;
  riders: number;
  /** Net above RM 0. */
  paid: number;
  /** Net below RM 0: deductions bigger than the month's pay. */
  belowZero: number;
  parcels: number;
  netCents: number;
  /** Earnings by part, in cents. */
  rateCents: number;
  kpiCents: number;
  bonusCents: number;
  otherCents: number;
  penaltyCents: number;
  penaltyCases: number;
  advanceCents: number;
  top: { name: string; netCents: number } | null;
  /** Same branch last month, when it had a run. */
  prevNetCents: number | null;
}

export function branchStats(runs: StatRun[], prev: StatRun[]): BranchStat[] {
  const prevNet = new Map(prev.map((r) => [r.branch, r.results.reduce((n, x) => n + x.netCents, 0)]));
  return runs
    .map((run) => {
      const s: BranchStat = {
        branch: run.branch,
        runId: run.runId,
        status: run.status,
        riders: run.results.length,
        paid: run.results.filter((r) => r.netCents > 0).length,
        belowZero: run.results.filter((r) => r.netCents < 0).length,
        parcels: run.parcels,
        netCents: 0,
        rateCents: 0,
        kpiCents: 0,
        bonusCents: 0,
        otherCents: 0,
        penaltyCents: 0,
        penaltyCases: 0,
        advanceCents: 0,
        top: null,
        prevNetCents: prevNet.get(run.branch) ?? null,
      };
      for (const r of run.results) {
        s.netCents += r.netCents;
        s.penaltyCases += r.cases;
        if (!s.top || r.netCents > s.top.netCents) s.top = { name: r.name, netCents: r.netCents };
        for (const l of r.lines) {
          if (l.ruleId === ADVANCE) s.advanceCents += l.cents;
          else if (l.kind === "PENALTY") s.penaltyCents += l.cents;
          else if (DEDUCTING.includes(l.kind)) continue;
          else if (l.kind === "PARCEL") s.rateCents += l.cents;
          else if (l.kind === "KPI") s.kpiCents += l.cents;
          else if (l.kind === "SUCCESS") s.bonusCents += l.cents;
          else s.otherCents += l.cents;
        }
      }
      return s;
    })
    .sort((a, b) => b.netCents - a.netCents);
}
