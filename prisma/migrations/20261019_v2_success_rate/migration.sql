-- v2 success-rate bonus. Additive: a value on the v2-only PayRuleKind enum and a new table.
ALTER TYPE "PayRuleKind" ADD VALUE 'SUCCESS';

CREATE TABLE "SuccessRate" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "extId" TEXT NOT NULL,
    "name" TEXT,
    "outlet" TEXT,
    "rateBp" INTEGER NOT NULL,
    "delivered" INTEGER,
    "total" INTEGER,
    "fileName" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuccessRate_agentId_period_extId_key" ON "SuccessRate"("agentId", "period", "extId");

ALTER TABLE "SuccessRate" ADD CONSTRAINT "SuccessRate_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
