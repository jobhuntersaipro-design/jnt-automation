-- CreateTable
CREATE TABLE "PayrollCheck" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "people" JSONB NOT NULL,
    "notes" JSONB,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCheck_agentId_period_key" ON "PayrollCheck"("agentId", "period");

-- AddForeignKey
ALTER TABLE "PayrollCheck" ADD CONSTRAINT "PayrollCheck_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

