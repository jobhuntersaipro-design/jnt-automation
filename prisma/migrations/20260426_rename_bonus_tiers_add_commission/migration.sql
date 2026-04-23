-- Rename IncentiveTier concept → BonusTier + add SalaryRecord.commission.
-- Paired with the 20260425_incentive_tiers migration which introduced the
-- per-parcel post-threshold tier model under the "IncentiveTier" name.
--
-- Additive DB-level rename (no data change). Adds SalaryRecord.commission
-- as a new nullable-with-default manual additive field that flows into
-- netSalary alongside petrolSubsidy and the deductions.

-- 1. Rename IncentiveTier table + its PK/FK/index identifiers.
ALTER TABLE "IncentiveTier" RENAME TO "BonusTier";
ALTER TABLE "BonusTier" RENAME CONSTRAINT "IncentiveTier_pkey" TO "BonusTier_pkey";
ALTER TABLE "BonusTier" RENAME CONSTRAINT "IncentiveTier_dispatcherId_fkey" TO "BonusTier_dispatcherId_fkey";
ALTER INDEX "IncentiveTier_dispatcherId_tier_key" RENAME TO "BonusTier_dispatcherId_tier_key";
ALTER INDEX "IncentiveTier_dispatcherId_idx" RENAME TO "BonusTier_dispatcherId_idx";

-- 2. AgentDefault: rename per-tier commission columns.
ALTER TABLE "AgentDefault" RENAME COLUMN "incentiveTier1Commission" TO "bonusTier1Commission";
ALTER TABLE "AgentDefault" RENAME COLUMN "incentiveTier2Commission" TO "bonusTier2Commission";
ALTER TABLE "AgentDefault" RENAME COLUMN "incentiveTier3Commission" TO "bonusTier3Commission";

-- 3. SalaryRecord: rename snapshot + data columns; add commission.
ALTER TABLE "SalaryRecord" RENAME COLUMN "incentiveSnapshot" TO "bonusTierSnapshot";
ALTER TABLE "SalaryRecord" RENAME COLUMN "incentive" TO "bonusTierEarnings";
ALTER TABLE "SalaryRecord" ADD COLUMN "commission" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 4. SalaryLineItem: rename the per-parcel flag.
ALTER TABLE "SalaryLineItem" RENAME COLUMN "isIncentive" TO "isBonusTier";
