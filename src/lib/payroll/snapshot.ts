import type { WeightTierInput, IncentiveRuleInput, PetrolRuleInput } from "@/lib/upload/calculator";

export type ChangeType =
  | "NEW"
  | "INCENTIVE_CHANGED"
  | "PETROL_ELIGIBILITY_CHANGED"
  | "PETROL_THRESHOLD_CHANGED"
  | "PETROL_AMOUNT_CHANGED"
  | "TIER_CHANGED";

export interface Change {
  type: ChangeType;
  tier?: number;
  from?: number | boolean;
  to?: number | boolean;
  label?: string;
}

export interface DispatcherRulesSummary {
  dispatcherId: string;
  extId: string;
  name: string;
  weightTiers: WeightTierInput[];
  incentiveRule: IncentiveRuleInput;
  petrolRule: PetrolRuleInput;
}

export interface PreviousSnapshot {
  weightTiersSnapshot: WeightTierInput[];
  incentiveSnapshot: IncentiveRuleInput;
  petrolSnapshot: PetrolRuleInput;
}

export interface RulesSummaryRow {
  dispatcherId: string;
  extId: string;
  name: string;
  incentiveAmount: number;
  petrolEligible: boolean;
  petrolAmount: number;
  changes: Change[];
}

/**
 * Detect changes between current dispatcher rules and previous month's snapshot.
 */
export function detectChanges(
  current: DispatcherRulesSummary,
  prev: PreviousSnapshot | null,
): Change[] {
  if (!prev) return [{ type: "NEW" }];

  const changes: Change[] = [];

  // Incentive amount changed
  if (current.incentiveRule.incentiveAmount !== prev.incentiveSnapshot.incentiveAmount) {
    changes.push({
      type: "INCENTIVE_CHANGED",
      from: prev.incentiveSnapshot.incentiveAmount,
      to: current.incentiveRule.incentiveAmount,
      label: "Incentive",
    });
  }

  // Petrol eligibility changed
  if (current.petrolRule.isEligible !== prev.petrolSnapshot.isEligible) {
    changes.push({
      type: "PETROL_ELIGIBILITY_CHANGED",
      from: prev.petrolSnapshot.isEligible,
      to: current.petrolRule.isEligible,
      label: "Petrol eligibility",
    });
  }

  // Petrol daily threshold changed
  if (current.petrolRule.dailyThreshold !== prev.petrolSnapshot.dailyThreshold) {
    changes.push({
      type: "PETROL_THRESHOLD_CHANGED",
      from: prev.petrolSnapshot.dailyThreshold,
      to: current.petrolRule.dailyThreshold,
      label: "Petrol threshold",
    });
  }

  // Petrol subsidy amount changed
  if (current.petrolRule.subsidyAmount !== prev.petrolSnapshot.subsidyAmount) {
    changes.push({
      type: "PETROL_AMOUNT_CHANGED",
      from: prev.petrolSnapshot.subsidyAmount,
      to: current.petrolRule.subsidyAmount,
      label: "Petrol amount",
    });
  }

  // Weight tier commission changes
  for (const tier of current.weightTiers) {
    const prevTier = prev.weightTiersSnapshot.find((t) => t.tier === tier.tier);
    if (prevTier && prevTier.commission !== tier.commission) {
      changes.push({
        type: "TIER_CHANGED",
        tier: tier.tier,
        from: prevTier.commission,
        to: tier.commission,
        label: `Tier ${tier.tier}`,
      });
    }
  }

  return changes;
}

/**
 * Build rules summary rows with change indicators for all dispatchers in a preview.
 */
export function buildRulesSummary(
  dispatchers: DispatcherRulesSummary[],
  previousSnapshots: Map<string, PreviousSnapshot>,
): RulesSummaryRow[] {
  return dispatchers.map((d) => {
    const prev = previousSnapshots.get(d.dispatcherId) ?? null;
    return {
      dispatcherId: d.dispatcherId,
      extId: d.extId,
      name: d.name,
      incentiveAmount: d.incentiveRule.incentiveAmount,
      petrolEligible: d.petrolRule.isEligible,
      petrolAmount: d.petrolRule.subsidyAmount,
      changes: detectChanges(d, prev),
    };
  });
}
