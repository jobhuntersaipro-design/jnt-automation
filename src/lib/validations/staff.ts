import { z } from "zod";

export const weightTierSchema = z.object({
  tier: z.number().int().min(1).max(3),
  minWeight: z.number().min(0),
  maxWeight: z.number().min(0).nullable(),
  commission: z.number().min(0),
});

export const bonusTierSchema = z.object({
  tier: z.number().int().min(1).max(3),
  minWeight: z.number().min(0),
  maxWeight: z.number().min(0).nullable(),
  commission: z.number().min(0),
});

export const incentiveRuleSchema = z.object({
  orderThreshold: z.number().int().min(0),
});

export const petrolRuleSchema = z.object({
  isEligible: z.boolean(),
  dailyThreshold: z.number().int().min(1),
  subsidyAmount: z.number().min(0),
});

export const settingsBodySchema = z.object({
  icNo: z.string().optional(),
  branchCode: z.string().optional(),
  weightTiers: z.array(weightTierSchema).length(3).optional(),
  bonusTiers: z.array(bonusTierSchema).length(3).optional(),
  incentiveRule: incentiveRuleSchema.optional(),
  petrolRule: petrolRuleSchema.optional(),
});

export const defaultsBodySchema = z.object({
  weightTiers: z.array(weightTierSchema).length(3),
  bonusTiers: z.array(bonusTierSchema).length(3),
  incentiveRule: incentiveRuleSchema,
  petrolRule: petrolRuleSchema,
});

export const applyDefaultsBodySchema = defaultsBodySchema.extend({
  dispatcherIds: z.array(z.string()).optional(),
  /**
   * When set, "apply to all" narrows to dispatchers in this branch only.
   * Saves writes from blasting an unrelated branch's dispatchers when the
   * agent is editing one branch's defaults. Ignored when dispatcherIds is
   * given (explicit selection wins).
   */
  branchCode: z.string().optional(),
});

export const adjustmentsSchema = z.object({
  commission: z.number().min(0).max(100_000).optional(),
  penalty: z.number().min(0).max(100_000).optional(),
  advance: z.number().min(0).max(100_000).optional(),
});

export const recalculateBodySchema = z.object({
  salaryRecordId: z.string().min(1),
  updatedSnapshot: z.object({
    weightTiers: z.array(weightTierSchema).optional(),
    bonusTiers: z.array(bonusTierSchema).optional(),
    bonusTierEarnings: incentiveRuleSchema.optional(),
    petrol: petrolRuleSchema.optional(),
  }),
  adjustments: adjustmentsSchema.optional(),
});
