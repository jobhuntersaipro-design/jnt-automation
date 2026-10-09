import type { Period } from "@/lib/v2/pay/resolve";

// "No rate card covers this month": moves the account's rate cards back to start in `period`, numbers unchanged.
// Only the earliest rates of a card and the earliest assignment of each "who" move, and only when nothing already
// covers the month, so months that were paid before keep exactly what they had.

export interface CoverRule {
  id: string;
  versions: { id: string; effectiveFrom: Period }[];
  assignments: { id: string; branchId: string | null; dispatcherId: string | null; employment: string | null; effectiveFrom: Period }[];
}

export interface CoverPlan {
  versions: string[];
  assignments: string[];
  /** Set when no rate card applies to anyone: this one is given to everyone from `period`. */
  assignEveryone: string | null;
}

const earliest = <T extends { effectiveFrom: Period }>(rows: T[]) => rows.reduce<T | null>((a, b) => (!a || b.effectiveFrom < a.effectiveFrom ? b : a), null);

/** `rules` newest first; null when there's no rate card at all. */
export function planCover(period: Period, rules: CoverRule[]): CoverPlan | null {
  if (rules.length === 0) return null;
  const versions = rules.flatMap((r) => {
    const first = earliest(r.versions);
    return first && first.effectiveFrom > period ? [first.id] : [];
  });
  const byWho = new Map<string, CoverRule["assignments"]>();
  for (const a of rules.flatMap((r) => r.assignments)) {
    const who = `${a.branchId}|${a.dispatcherId}|${a.employment}`;
    byWho.set(who, [...(byWho.get(who) ?? []), a]);
  }
  const assignments = [...byWho.values()].flatMap((rows) => {
    const first = earliest(rows);
    return first && first.effectiveFrom > period ? [first.id] : [];
  });
  return { versions, assignments, assignEveryone: byWho.size === 0 ? rules[0].id : null };
}
