import type { Parcels } from "@/lib/v2/pay/engine";

// Merging two dispatcher records that are one person (a rider who moved branch and got a second
// J&T ID). Pure: works out what moves where; the action applies it.

export interface MergeResult {
  id: string;
  runId: string;
  final: boolean;
  /** "PHG415 · 202610", for the refusal message. */
  label: string;
  parcels: Parcels;
}

export interface MergePlan {
  /** Results that only the merged record has in their run: they move to the kept one. */
  move: string[];
  /** Draft runs both are in: the merged parcels join the kept result, then the run is recalculated. */
  combine: {
    keepId: string;
    dropId: string;
    runId: string;
    parcels: Parcels;
  }[];
  /** Finalised runs both are in: pay there can't change, so the merge is refused. */
  blocked: string[];
}

/** The kept record's parcels, then the merged record's (delivery order within each J&T ID). */
export function joinParcels(a: Parcels, b: Parcels): Parcels {
  return { w: [...a.w, ...b.w], c: a.c + b.c };
}

export function planMerge(keep: MergeResult[], drop: MergeResult[]): MergePlan {
  const byRun = new Map(keep.map((r) => [r.runId, r]));
  const plan: MergePlan = { move: [], combine: [], blocked: [] };
  for (const r of drop) {
    const k = byRun.get(r.runId);
    if (!k) plan.move.push(r.id);
    else if (r.final || k.final) plan.blocked.push(r.label);
    else
      plan.combine.push({
        keepId: k.id,
        dropId: r.id,
        runId: r.runId,
        parcels: joinParcels(k.parcels, r.parcels),
      });
  }
  return plan;
}

/** Vehicle and type: the kept record's months win; the merged record fills months the kept one hasn't set. */
export function profilesToMove<T extends { id: string; effectiveFrom: number }>(
  keep: T[],
  drop: T[],
): string[] {
  const months = new Set(keep.map((p) => p.effectiveFrom));
  return drop.filter((p) => !months.has(p.effectiveFrom)).map((p) => p.id);
}
