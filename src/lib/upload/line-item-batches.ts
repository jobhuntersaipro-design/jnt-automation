import { priceLineItems } from "./calculator";
import type { BonusTierInput, LineItem, WeightTierInput } from "./calculator";
import type { ParsedRow } from "./parser";

export interface SalaryLineItemRow extends LineItem {
  salaryRecordId: string;
}

/** One saved salary record and what's needed to price its parcels. */
export interface LineItemSource {
  salaryRecordId: string;
  rows: ParsedRow[];
  weightTiers: WeightTierInput[];
  bonusTiers: BonusTierInput[];
  orderThreshold: number;
}

/**
 * Yield a month's line items in insert-ready batches of `batchSize`,
 * pricing one dispatcher at a time as batches are pulled. Only the batches
 * being inserted are in memory, never the whole month's line items.
 *
 * Batches come out exactly as if every source's items were priced,
 * concatenated in source order and sliced every `batchSize`.
 */
export function* lineItemBatches(
  sources: Iterable<LineItemSource>,
  batchSize: number,
): Generator<SalaryLineItemRow[]> {
  let batch: SalaryLineItemRow[] = [];
  for (const s of sources) {
    const items = priceLineItems(s.rows, s.weightTiers, s.bonusTiers, s.orderThreshold);
    for (const item of items) {
      batch.push({ salaryRecordId: s.salaryRecordId, ...item });
      if (batch.length === batchSize) {
        yield batch;
        batch = [];
      }
    }
  }
  if (batch.length > 0) yield batch;
}

/**
 * Group parsed rows by dispatcher extId, keeping only the extIds asked for.
 * Rows of other dispatchers (unknown or skipped) are dropped so they can be
 * freed along with the parser's array.
 */
export function groupRowsByExtId(
  rows: ParsedRow[],
  extIds: Iterable<string>,
): Map<string, ParsedRow[]> {
  const groups = new Map<string, ParsedRow[]>();
  for (const extId of extIds) groups.set(extId, []);
  for (const row of rows) groups.get(row.dispatcherId)?.push(row);
  return groups;
}
