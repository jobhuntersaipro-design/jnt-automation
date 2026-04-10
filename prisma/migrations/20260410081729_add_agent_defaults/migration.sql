-- CreateTable
CREATE TABLE "AgentDefault" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tier1MinWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tier1MaxWeight" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "tier1Commission" DOUBLE PRECISION NOT NULL DEFAULT 1.00,
    "tier2MinWeight" DOUBLE PRECISION NOT NULL DEFAULT 5.01,
    "tier2MaxWeight" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "tier2Commission" DOUBLE PRECISION NOT NULL DEFAULT 1.40,
    "tier3MinWeight" DOUBLE PRECISION NOT NULL DEFAULT 10.01,
    "tier3Commission" DOUBLE PRECISION NOT NULL DEFAULT 2.20,
    "orderThreshold" INTEGER NOT NULL DEFAULT 2000,
    "incentiveAmount" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "petrolEligible" BOOLEAN NOT NULL DEFAULT true,
    "dailyThreshold" INTEGER NOT NULL DEFAULT 70,
    "subsidyAmount" DOUBLE PRECISION NOT NULL DEFAULT 15,

    CONSTRAINT "AgentDefault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefault_agentId_key" ON "AgentDefault"("agentId");

-- AddForeignKey
ALTER TABLE "AgentDefault" ADD CONSTRAINT "AgentDefault_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
