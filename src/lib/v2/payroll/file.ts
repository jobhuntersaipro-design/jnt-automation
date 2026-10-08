import type { ParsedRow } from "@/lib/upload/parser";
import type { Parcels } from "@/lib/v2/pay/engine";
import { toPeriod, type Period } from "@/lib/v2/pay/resolve";

// A month's J&T delivery file, as v1's parser reads it, turned into one outlet, one month and
// each dispatcher's parcels in delivery order. Pure, so it is tested without files.

export interface FileDispatcher {
  extId: string;
  name: string;
  parcels: Parcels;
}

export interface FileStats {
  rows: number;
  /** Signed at another outlet. Paid with this outlet, as v1 does; shown so nobody is surprised. */
  otherOutlets: number;
  /** Delivered in another month. Also paid here, as in v1. */
  otherMonths: number;
  /** No delivery date: paid, placed last in the month's order. */
  noDate: number;
}

export interface FileSummary {
  outlet: string;
  period: Period;
  dispatchers: FileDispatcher[];
  stats: FileStats;
}

export type SummaryResult = { ok: true; summary: FileSummary } | { ok: false; error: "run.err.noRows" | "run.err.noOutlet" | "run.err.noMonth" };

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (best === undefined || n > (counts.get(best) ?? 0)) best = v;
  }
  return best;
}

// Excel dates have no time zone: the parser reads the sheet's wall-clock time as UTC.
const monthOf = (d: Date) => toPeriod(d.getUTCFullYear(), d.getUTCMonth() + 1);

export function summariseRows(rows: ParsedRow[]): SummaryResult {
  if (rows.length === 0) return { ok: false, error: "run.err.noRows" };
  const outlet = mostCommon(rows.map((r) => r.branchName.trim()).filter(Boolean));
  if (!outlet) return { ok: false, error: "run.err.noOutlet" };
  const period = mostCommon(rows.flatMap((r) => (r.deliveryDate ? [monthOf(r.deliveryDate)] : [])));
  if (period === undefined) return { ok: false, error: "run.err.noMonth" };

  // Delivery order decides which parcels fall in which marginal tier. Undated rows go last;
  // equal times keep the file's order (Array.prototype.sort is stable).
  const time = (r: ParsedRow) => r.deliveryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const ordered = [...rows].sort((a, b) => time(a) - time(b));

  const byId = new Map<string, FileDispatcher>();
  for (const r of ordered) {
    const extId = r.dispatcherId.trim();
    const d = byId.get(extId) ?? { extId, name: r.dispatcherName.trim() || extId, parcels: { w: [], c: "" } };
    byId.set(extId, d);
    d.parcels.w.push(r.billingWeight);
  }
  // SC and SC-RTN parcels aren't marked in the J&T columns we read yet, so every parcel is normal.
  for (const d of byId.values()) d.parcels.c = "n".repeat(d.parcels.w.length);

  const stats: FileStats = {
    rows: rows.length,
    otherOutlets: rows.filter((r) => r.branchName.trim() && r.branchName.trim() !== outlet).length,
    otherMonths: rows.filter((r) => r.deliveryDate && monthOf(r.deliveryDate) !== period).length,
    noDate: rows.filter((r) => !r.deliveryDate).length,
  };
  const dispatchers = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.extId.localeCompare(b.extId));
  return { ok: true, summary: { outlet, period, dispatchers, stats } };
}
