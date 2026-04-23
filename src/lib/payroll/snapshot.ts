import type {
  IncentiveRuleInput,
  BonusTierInput,
  PetrolRuleInput,
  WeightTierInput,
} from "@/lib/upload/calculator";
import { readBonusTierSnapshot } from "@/lib/staff/bonus-tier-snapshot";

export type ChangeType =
  | "NEW"
  | "INCENTIVE_THRESHOLD_CHANGED"
  | "BONUS_TIER_CHANGED"
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
  bonusTiers: BonusTierInput[];
  petrolRule: PetrolRuleInput;
}

export interface PreviousSnapshot {
  weightTiersSnapshot: WeightTierInput[];
  bonusTierSnapshot: unknown; // may be legacy { orderThreshold, incentiveAmount } or new { orderThreshold, tiers }
  petrolSnapshot: PetrolRuleInput;
}

export interface RulesSummaryRow {
  dispatcherId: string;
  extId: string;
  name: string;
  orderThreshold: number;
  incentiveTier1: number;
  incentiveTier2: number;
  incentiveTier3: number;
  petrolEligible: boolean;
  petrolAmount: number;
  changes: Change[];
}

/**
 * Detect changes between current dispatcher rules and previous month's snapshot.
 *
 * When the previous snapshot is the legacy flat-amount shape, tier-level
 * comparisons are suppressed (we can't meaningfully compare "RM200 flat" to
 * "three per-weight rates"); a single `NEW` change is emitted for the
 * bonusTierEarnings block so the user knows something changed.
 */
export function detectChanges(
  current: DispatcherRulesSummary,
  prev: PreviousSnapshot | null,
): Change[] {
  if (!prev) return [{ type: "NEW" }];

  const changes: Change[] = [];

  const prevBonusTier = readBonusTierSnapshot(prev.bonusTierSnapshot);

  // Threshold change (works for both legacy and new snapshots)
  if (prevBonusTier && prevBonusTier.orderThreshold !== current.incentiveRule.orderThreshold) {
    changes.push({
      type: "INCENTIVE_THRESHOLD_CHANGED",
      from: prevBonusTier.orderThreshold,
      to: current.incentiveRule.orderThreshold,
      label: "Bonus tier threshold",
    });
  }

  // Tier-level bonusTierEarnings comparisons — only when previous snapshot is new-shape
  if (prevBonusTier?.tiers) {
    for (const tier of current.bonusTiers) {
      const prevTier = prevBonusTier.tiers.find((t) => t.tier === tier.tier);
      if (prevTier && prevTier.commission !== tier.commission) {
        changes.push({
          type: "BONUS_TIER_CHANGED",
          tier: tier.tier,
          from: prevTier.commission,
          to: tier.commission,
          label: `Bonus T${tier.tier}`,
        });
      }
    }
  }

  if (current.petrolRule.isEligible !== prev.petrolSnapshot.isEligible) {
    changes.push({
      type: "PETROL_ELIGIBILITY_CHANGED",
      from: prev.petrolSnapshot.isEligible,
      to: current.petrolRule.isEligible,
      label: "Petrol eligibility",
    });
  }

  if (current.petrolRule.dailyThreshold !== prev.petrolSnapshot.dailyThreshold) {
    changes.push({
      type: "PETROL_THRESHOLD_CHANGED",
      from: prev.petrolSnapshot.dailyThreshold,
      to: current.petrolRule.dailyThreshold,
      label: "Petrol threshold",
    });
  }

  if (current.petrolRule.subsidyAmount !== prev.petrolSnapshot.subsidyAmount) {
    changes.push({
      type: "PETROL_AMOUNT_CHANGED",
      from: prev.petrolSnapshot.subsidyAmount,
      to: current.petrolRule.subsidyAmount,
      label: "Petrol amount",
    });
  }

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
    const byTier = new Map(d.bonusTiers.map((t) => [t.tier, t.commission]));
    return {
      dispatcherId: d.dispatcherId,
      extId: d.extId,
      name: d.name,
      orderThreshold: d.incentiveRule.orderThreshold,
      incentiveTier1: byTier.get(1) ?? 0,
      incentiveTier2: byTier.get(2) ?? 0,
      incentiveTier3: byTier.get(3) ?? 0,
      petrolEligible: d.petrolRule.isEligible,
      petrolAmount: d.petrolRule.subsidyAmount,
      changes: detectChanges(d, prev),
    };
  });
}
