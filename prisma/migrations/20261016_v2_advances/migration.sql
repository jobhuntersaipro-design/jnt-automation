-- v2, additive: advances given to dispatchers, taken back from pay (carried forward when pay can't cover them).

-- CreateTable
CREATE TABLE "Advance" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Advance_agentId_period_idx" ON "Advance"("agentId", "period");

-- CreateIndex
CREATE INDEX "Advance_dispatcherId_idx" ON "Advance"("dispatcherId");

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

