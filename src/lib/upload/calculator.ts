import type { ParsedRow } from "./parser";

export interface WeightTierInput {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface BonusTierInput {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface IncentiveRuleInput {
  orderThreshold: number;
}

export interface PetrolRuleInput {
  isEligible: boolean;
  dailyThreshold: number;
  subsidyAmount: number;
}

export interface DispatcherRules {
  dispatcherId: string;
  extId: string;
  weightTiers: WeightTierInput[];
  incentiveRule: IncentiveRuleInput;
  bonusTiers: BonusTierInput[];
  petrolRule: PetrolRuleInput;
}

export interface BonusTierSnapshot {
  orderThreshold: number;
  tiers: BonusTierInput[];
}

export interface SalaryResult {
  dispatcherId: string;
  extId: string;
  totalOrders: number;
  baseSalary: number;
  bonusTierEarnings: number;
  petrolSubsidy: number;
  petrolQualifyingDays: number;
  commission: number;
  penalty: number;
  advance: number;
  netSalary: number;
  lineItems: LineItem[];
  weightTiersSnapshot: WeightTierInput[];
  bonusTierSnapshot: BonusTierSnapshot;
  petrolSnapshot: PetrolRuleInput;
}

export interface LineItem {
  waybillNumber: string;
  weight: number;
  commission: number;
  deliveryDate: Date | null;
  isBonusTier: boolean;
}

export function calculateSalary(
  dispatcher: DispatcherRules,
  deliveries: ParsedRow[],
): SalaryResult {
  const sorted = stableSortDeliveries(deliveries);
  const threshold = dispatcher.incentiveRule.orderThreshold;

  const lineItems: LineItem[] = sorted.map((d, idx) => {
    // Parcel index is 0-based, threshold is 1-based count.
    // Parcels at index >= threshold are post-threshold (e.g. threshold 2000 → index 2000 = parcel #2001).
    // threshold === 0 means bonus tier is disabled — without this guard every
    // parcel (i >= 0) would be flagged as bonus, inverting the toggle.
    const isBonusTier = threshold > 0 && idx >= threshold;
    const tiers = isBonusTier ? dispatcher.bonusTiers : dispatcher.weightTiers;
    const commission = getCommission(d.billingWeight, tiers);
    return {
      waybillNumber: d.waybillNumber,
      weight: d.billingWeight,
      commission,
      deliveryDate: d.deliveryDate,
      isBonusTier,
    };
  });

  let baseSalary = 0;
  let bonusTierEarnings = 0;
  for (const li of lineItems) {
    if (li.isBonusTier) bonusTierEarnings += li.commission;
    else baseSalary += li.commission;
  }

  const totalOrders = deliveries.length;

  let petrolSubsidy = 0;
  let petrolQualifyingDays = 0;
  if (dispatcher.petrolRule.isEligible) {
    const byDate = groupByDate(deliveries);
    for (const [key, dayDeliveries] of Object.entries(byDate)) {
      if (key === "unknown") continue;
      if (dayDeliveries.length >= dispatcher.petrolRule.dailyThreshold) {
        petrolQualifyingDays++;
        petrolSubsidy += dispatcher.petrolRule.subsidyAmount;
      }
    }
  }

  const commission = 0;
  const penalty = 0;
  const advance = 0;
  const netSalary =
    baseSalary + bonusTierEarnings + petrolSubsidy + commission - penalty - advance;

  return {
    dispatcherId: dispatcher.dispatcherId,
    extId: dispatcher.extId,
    totalOrders,
    baseSalary: round2(baseSalary),
    bonusTierEarnings: round2(bonusTierEarnings),
    petrolSubsidy: round2(petrolSubsidy),
    petrolQualifyingDays,
    commission,
    penalty,
    advance,
    netSalary: round2(netSalary),
    lineItems,
    weightTiersSnapshot: dispatcher.weightTiers,
    bonusTierSnapshot: {
      orderThreshold: dispatcher.incentiveRule.orderThreshold,
      tiers: dispatcher.bonusTiers,
    },
    petrolSnapshot: dispatcher.petrolRule,
  };
}

/**
 * Price a list of parsed rows into line items without computing subsidies or
 * snapshots. Used at confirm-time to rebuild line items from snapshots
 * captured during preview — keeps the same stable ordering + threshold split
 * as `calculateSalary` so `isBonusTier` flags agree with the preview's
 * `baseSalary` / `bonusTierEarnings` numbers.
 */
export function priceLineItems(
  deliveries: ParsedRow[],
  weightTiers: WeightTierInput[],
  bonusTiers: BonusTierInput[],
  orderThreshold: number,
): LineItem[] {
  const sorted = stableSortDeliveries(deliveries);
  return sorted.map((d, idx) => {
    const isBonusTier = orderThreshold > 0 && idx >= orderThreshold;
    const tiers = isBonusTier ? bonusTiers : weightTiers;
    return {
      waybillNumber: d.waybillNumber,
      weight: d.billingWeight,
      commission: getCommission(d.billingWeight, tiers),
      deliveryDate: d.deliveryDate,
      isBonusTier,
    };
  });
}

/**
 * Sort deliveries by deliveryDate asc, then by waybillNumber asc as stable tiebreaker.
 * Rows with null deliveryDate sort last so they can't unambiguously occupy the
 * first `threshold` positions.
 */
function stableSortDeliveries(deliveries: ParsedRow[]): ParsedRow[] {
  return [...deliveries].sort((a, b) => {
    const aTime = a.deliveryDate ? a.deliveryDate.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.deliveryDate ? b.deliveryDate.getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    if (a.waybillNumber < b.waybillNumber) return -1;
    if (a.waybillNumber > b.waybillNumber) return 1;
    return 0;
  });
}

export function getCommission(
  weight: number,
  tiers: Array<WeightTierInput | BonusTierInput>,
): number {
  const tier = tiers.find(
    (t) =>
      weight >= t.minWeight &&
      (t.maxWeight === null || weight <= t.maxWeight),
  );
  return tier?.commission ?? 0;
}

function groupByDate(
  deliveries: ParsedRow[],
): Record<string, ParsedRow[]> {
  const groups: Record<string, ParsedRow[]> = {};
  for (const d of deliveries) {
    const key = d.deliveryDate ? d.deliveryDate.toDateString() : "unknown";
    (groups[key] ??= []).push(d);
  }
  return groups;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
