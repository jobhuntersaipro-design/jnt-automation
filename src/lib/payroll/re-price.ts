import { getCommission, type BonusTierInput, type WeightTierInput, type PetrolRuleInput } from "@/lib/upload/calculator";

/**
 * Re-prices persisted SalaryLineItem rows against the dispatcher's CURRENT
 * rules without needing the original Excel file.
 *
 * Used by the Edit & Recalculate save path so that when an agent changes
 * bonus tier rates (or threshold / petrol eligibility) in dispatcher
 * settings, the month's totals actually reflect those changes the next time
 * they save on the payroll page.
 *
 * Line items are re-sorted with the same (deliveryDate asc, waybillNumber
 * asc) comparator the upload-time calculator uses, so re-flagging
 * `isBonusTier` under a changed `orderThreshold` matches what a fresh upload
 * of the same data would produce.
 */

export interface RepriceLineItem {
  waybillNumber: string;
  weight: number;
  deliveryDate: Date | null;
  /** Original flag — used as fallback if the comparator can't establish a stable order (e.g. all dates null). */
  isBonusTier: boolean;
}

export interface RepriceResult {
  baseSalary: number;
  bonusTierEarnings: number;
  petrolSubsidy: number;
  petrolQualifyingDays: number;
  /**
   * Line items re-priced + re-flagged, in input order (NOT sort order) so
   * callers can zip them back against the original DB rows by index.
   */
  items: {
    waybillNumber: string;
    weight: number;
    commission: number;
    isBonusTier: boolean;
  }[];
}

export function repriceSalary(
  items: RepriceLineItem[],
  weightTiers: WeightTierInput[],
  bonusTiers: BonusTierInput[],
  orderThreshold: number,
  petrol: PetrolRuleInput,
): RepriceResult {
  // Sort a SEPARATE array — we still want to return results keyed by input
  // index so the caller can update the DB rows one-to-one.
  const indexed = items.map((it, idx) => ({ it, idx }));
  indexed.sort((a, b) => {
    const aTime = a.it.deliveryDate ? a.it.deliveryDate.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.it.deliveryDate ? b.it.deliveryDate.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    if (a.it.waybillNumber < b.it.waybillNumber) return -1;
    if (a.it.waybillNumber > b.it.waybillNumber) return 1;
    return 0;
  });

  // Re-flag isBonusTier based on the new threshold, in sort order.
  const sortedIsBonus = new Array<boolean>(indexed.length);
  for (let rank = 0; rank < indexed.length; rank++) {
    sortedIsBonus[rank] = orderThreshold > 0 && rank >= orderThreshold;
  }

  // Re-price each item at its new flag + current rates, keyed by input index.
  const output: RepriceResult["items"] = new Array(items.length);
  let baseSalary = 0;
  let bonusTierEarnings = 0;
  for (let rank = 0; rank < indexed.length; rank++) {
    const { it, idx } = indexed[rank];
    const isBonus = sortedIsBonus[rank];
    const tiers = isBonus ? bonusTiers : weightTiers;
    const commission = getCommission(it.weight, tiers);
    if (isBonus) bonusTierEarnings += commission;
    else baseSalary += commission;
    output[idx] = {
      waybillNumber: it.waybillNumber,
      weight: it.weight,
      commission,
      isBonusTier: isBonus,
    };
  }

  // Petrol: per-qualifying-day subsidy, based on delivery dates.
  let petrolSubsidy = 0;
  let petrolQualifyingDays = 0;
  if (petrol.isEligible && petrol.dailyThreshold > 0) {
    const counts = new Map<string, number>();
    for (const it of items) {
      if (!it.deliveryDate) continue;
      const key = it.deliveryDate.toDateString();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      if (count >= petrol.dailyThreshold) {
        petrolQualifyingDays++;
        petrolSubsidy += petrol.subsidyAmount;
      }
    }
  }

  return {
    baseSalary: round2(baseSalary),
    bonusTierEarnings: round2(bonusTierEarnings),
    petrolSubsidy: round2(petrolSubsidy),
    petrolQualifyingDays,
    items: output,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
