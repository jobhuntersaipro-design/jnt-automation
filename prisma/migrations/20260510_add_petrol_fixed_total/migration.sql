-- Add useFixedTotal + fixedTotalAmount to PetrolRule and AgentDefault.
--
-- Fixed-total mode lets the user enter a single monthly petrol subsidy
-- amount instead of the daily-threshold × per-day-amount calculation.
-- isEligible remains the master switch — fixed-total is a calculation
-- mode within "eligible". Defaults preserve today's behaviour for every
-- existing row (useFixedTotal = false → daily-threshold path).

ALTER TABLE "PetrolRule"
  ADD COLUMN "useFixedTotal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fixedTotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "AgentDefault"
  ADD COLUMN "useFixedTotal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fixedTotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
