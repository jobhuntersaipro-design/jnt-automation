-- AlterTable
ALTER TABLE "Dispatcher" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "normalizedName" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "icNo" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DispatcherAssignment" (
    "id" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "extId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "DispatcherAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispatcherAssignment_dispatcherId_idx" ON "DispatcherAssignment"("dispatcherId");

-- CreateIndex
CREATE INDEX "DispatcherAssignment_branchId_idx" ON "DispatcherAssignment"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatcherAssignment_branchId_extId_key" ON "DispatcherAssignment"("branchId", "extId");

-- CreateIndex
CREATE INDEX "Dispatcher_agentId_idx" ON "Dispatcher"("agentId");

-- CreateIndex
CREATE INDEX "Dispatcher_agentId_icNo_idx" ON "Dispatcher"("agentId", "icNo");

-- CreateIndex
CREATE INDEX "Dispatcher_agentId_normalizedName_idx" ON "Dispatcher"("agentId", "normalizedName");

-- AddForeignKey
ALTER TABLE "Dispatcher" ADD CONSTRAINT "Dispatcher_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatcherAssignment" ADD CONSTRAINT "DispatcherAssignment_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatcherAssignment" ADD CONSTRAINT "DispatcherAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
