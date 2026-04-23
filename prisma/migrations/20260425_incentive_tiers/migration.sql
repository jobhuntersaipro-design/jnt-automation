-- Incentive tier restructure.
-- See context/features/incentive-tiers-spec.md.
--
-- Replaces the flat-amount incentive model (RM200 once orders >= threshold)
-- with a per-parcel weight-tier model that applies to parcels after the
-- threshold is crossed. Tier earnings roll into SalaryRecord.incentive with
-- new semantics (still a column, new meaning).

-- 1. New IncentiveTier table — mirrors WeightTier exactly.
CREATE TABLE "IncentiveTier" (
    "id" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "minWeight" DOUBLE PRECISION NOT NULL,
    "maxWeight" DOUBLE PRECISION,
    "commission" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "IncentiveTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncentiveTier_dispatcherId_tier_key" ON "IncentiveTier"("dispatcherId", "tier");
CREATE INDEX "IncentiveTier_dispatcherId_idx" ON "IncentiveTier"("dispatcherId");

ALTER TABLE "IncentiveTier" ADD CONSTRAINT "IncentiveTier_dispatcherId_fkey"
    FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Backfill 3 incentive tiers per existing dispatcher.
-- Weight ranges mirror the dispatcher's WeightTier rows so the boundaries
-- stay aligned by default. Commissions default to 1.50 / 2.10 / 3.30 (50%
-- uplift over the default weight-tier rates) — agents can tune afterwards.
INSERT INTO "IncentiveTier" ("id", "dispatcherId", "tier", "minWeight", "maxWeight", "commission")
SELECT
    gen_random_uuid()::text AS "id",
    wt."dispatcherId",
    wt."tier",
    wt."minWeight",
    wt."maxWeight",
    CASE wt."tier"
        WHEN 1 THEN 1.50
        WHEN 2 THEN 2.10
        WHEN 3 THEN 3.30
        ELSE wt."commission" * 1.5
    END AS "commission"
FROM "WeightTier" wt
WHERE NOT EXISTS (
    SELECT 1 FROM "IncentiveTier" it
    WHERE it."dispatcherId" = wt."dispatcherId" AND it."tier" = wt."tier"
);

-- 3. AgentDefault — drop incentiveAmount, add per-tier commission defaults.
ALTER TABLE "AgentDefault" DROP COLUMN IF EXISTS "incentiveAmount";
ALTER TABLE "AgentDefault" ADD COLUMN "incentiveTier1Commission" DOUBLE PRECISION NOT NULL DEFAULT 1.50;
ALTER TABLE "AgentDefault" ADD COLUMN "incentiveTier2Commission" DOUBLE PRECISION NOT NULL DEFAULT 2.10;
ALTER TABLE "AgentDefault" ADD COLUMN "incentiveTier3Commission" DOUBLE PRECISION NOT NULL DEFAULT 3.30;

-- 4. IncentiveRule — drop incentiveAmount (now lives in IncentiveTier rows).
ALTER TABLE "IncentiveRule" DROP COLUMN "incentiveAmount";

-- 5. SalaryLineItem — flag parcels priced at IncentiveTier rate.
ALTER TABLE "SalaryLineItem" ADD COLUMN "isIncentive" BOOLEAN NOT NULL DEFAULT false;
