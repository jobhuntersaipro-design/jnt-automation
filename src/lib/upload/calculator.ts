import type { ParsedRow } from "./parser";

export interface WeightTierInput {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface IncentiveRuleInput {
  orderThreshold: number;
  incentiveAmount: number;
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
  petrolRule: PetrolRuleInput;
}

export interface SalaryResult {
  dispatcherId: string;
  extId: string;
  totalOrders: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  petrolQualifyingDays: number;
  penalty: number;
  advance: number;
  netSalary: number;
  lineItems: LineItem[];
  /** Snapshots of the rules used for this calculation */
  weightTiersSnapshot: WeightTierInput[];
  incentiveSnapshot: IncentiveRuleInput;
  petrolSnapshot: PetrolRuleInput;
}

export interface LineItem {
  waybillNumber: string;
  weight: number;
  commission: number;
  deliveryDate: Date | null;
}

/**
 * Calculate salary for a single dispatcher given their delivery rows and rules.
 */
export function calculateSalary(
  dispatcher: DispatcherRules,
  deliveries: ParsedRow[],
): SalaryResult {
  // Step 1 — Base Salary (weight tier commissions)
  const lineItems: LineItem[] = deliveries.map((d) => {
    const commission = getCommission(d.billingWeight, dispatcher.weightTiers);
    return {
      waybillNumber: d.waybillNumber,
      weight: d.billingWeight,
      commission,
      deliveryDate: d.deliveryDate,
    };
  });

  const baseSalary = lineItems.reduce((sum, li) => sum + li.commission, 0);
  const totalOrders = deliveries.length;

  // Step 2 — Monthly Incentive
  const incentive =
    totalOrders >= dispatcher.incentiveRule.orderThreshold
      ? dispatcher.incentiveRule.incentiveAmount
      : 0;

  // Step 3 — Petrol Subsidy (per qualifying day)
  let petrolSubsidy = 0;
  let petrolQualifyingDays = 0;
  if (dispatcher.petrolRule.isEligible) {
    const byDate = groupByDate(deliveries);
    for (const [key, dayDeliveries] of Object.entries(byDate)) {
      if (key === "unknown") continue; // can't confirm daily threshold without a date
      if (dayDeliveries.length >= dispatcher.petrolRule.dailyThreshold) {
        petrolQualifyingDays++;
        petrolSubsidy += dispatcher.petrolRule.subsidyAmount;
      }
    }
  }

  // Step 4 — Net Salary (penalty + advance are 0 at calculation time)
  const penalty = 0;
  const advance = 0;
  const netSalary = baseSalary + incentive + petrolSubsidy - penalty - advance;

  return {
    dispatcherId: dispatcher.dispatcherId,
    extId: dispatcher.extId,
    totalOrders,
    baseSalary: round2(baseSalary),
    incentive: round2(incentive),
    petrolSubsidy: round2(petrolSubsidy),
    petrolQualifyingDays,
    penalty,
    advance,
    netSalary: round2(netSalary),
    lineItems,
    weightTiersSnapshot: dispatcher.weightTiers,
    incentiveSnapshot: dispatcher.incentiveRule,
    petrolSnapshot: dispatcher.petrolRule,
  };
}

/**
 * Find the commission for a given weight using the dispatcher's tiers.
 * Returns 0 if no tier matches.
 */
export function getCommission(
  weight: number,
  tiers: WeightTierInput[],
): number {
  const tier = tiers.find(
    (t) =>
      weight >= t.minWeight &&
      (t.maxWeight === null || weight <= t.maxWeight),
  );
  return tier?.commission ?? 0;
}

/**
 * Group deliveries by delivery date string for petrol subsidy calculation.
 * Rows without a delivery date are grouped under "unknown" (won't meet threshold alone).
 */
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
