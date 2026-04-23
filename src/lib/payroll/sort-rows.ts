export interface SortableRow {
  dispatcherId: string;
  name: string;
  totalOrders: number;
  baseSalary: number;
  bonusTierEarnings: number;
  petrolSubsidy: number;
  penalty: number;
  advance: number;
  commission: number;
  netSalary: number;
  isPinned: boolean;
}

export type SortKey =
  | "name"
  | "totalOrders"
  | "baseSalary"
  | "bonusTierEarnings"
  | "petrolSubsidy"
  | "penalty"
  | "advance"
  | "commission"
  | "netSalary";

export type SortDirection = "asc" | "desc";

/**
 * Returns a new array of rows with pinned rows first, then unpinned rows. Both
 * groups are sorted independently by `key`/`direction`. When `key` is null,
 * rows keep their natural order (pinned still floats to the top).
 *
 * `dispatcherId` is used as a stable tiebreaker so equal-value rows keep a
 * deterministic order between renders.
 */
export function sortAndPinRows<T extends SortableRow>(
  rows: T[],
  key: SortKey | null,
  direction: SortDirection,
): T[] {
  const pinned: T[] = [];
  const unpinned: T[] = [];
  // Track original index so "no sort" preserves input order when stable-sorting.
  const indexed = rows.map((r, idx) => ({ r, idx }));
  for (const entry of indexed) {
    if (entry.r.isPinned) pinned.push(entry.r);
    else unpinned.push(entry.r);
  }

  if (key === null) {
    return [...pinned, ...unpinned];
  }

  const cmp = (a: T, b: T): number => {
    const av = a[key];
    const bv = b[key];
    let diff: number;
    if (typeof av === "string" && typeof bv === "string") {
      diff = av.toLowerCase().localeCompare(bv.toLowerCase());
    } else {
      diff = (av as number) - (bv as number);
    }
    if (diff !== 0) return direction === "asc" ? diff : -diff;
    return a.dispatcherId.localeCompare(b.dispatcherId);
  };

  return [...pinned.sort(cmp), ...unpinned.sort(cmp)];
}
