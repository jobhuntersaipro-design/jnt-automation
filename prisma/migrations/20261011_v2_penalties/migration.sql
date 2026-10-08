-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('FAKE_ATTEMPT', 'FAKE_POP', 'PDNC', 'INACTIVE', 'POD', 'COD_LATE', 'COD_ISSUE', 'LOST', 'LATE_ARRIVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'IGNORED');

-- AlterEnum
ALTER TYPE "PayRuleKind" ADD VALUE 'PENALTY';

-- AlterTable
ALTER TABLE "PayrollResult" ADD COLUMN     "penalties" JSONB;

-- CreateTable
CREATE TABLE "PenaltyImport" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "added" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PenaltyImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenaltyItem" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "type" "PenaltyType" NOT NULL,
    "key" TEXT NOT NULL,
    "waybill" TEXT,
    "extId" TEXT,
    "name" TEXT,
    "who" TEXT,
    "outlet" TEXT,
    "occurredAt" TIMESTAMP(3),
    "amountCents" INTEGER,
    "appeal" TEXT,
    "note" TEXT,
    "waived" BOOLEAN NOT NULL DEFAULT false,
    "waivedBy" TEXT,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'UNMATCHED',
    "dispatcherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PenaltyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenaltyAlias" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dispatcherId" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PenaltyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PenaltyImport_agentId_period_idx" ON "PenaltyImport"("agentId", "period");

-- CreateIndex
CREATE INDEX "PenaltyItem_agentId_period_status_idx" ON "PenaltyItem"("agentId", "period", "status");

-- CreateIndex
CREATE INDEX "PenaltyItem_agentId_who_idx" ON "PenaltyItem"("agentId", "who");

-- CreateIndex
CREATE INDEX "PenaltyItem_dispatcherId_period_idx" ON "PenaltyItem"("dispatcherId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "PenaltyItem_agentId_period_type_key_key" ON "PenaltyItem"("agentId", "period", "type", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PenaltyAlias_agentId_key_key" ON "PenaltyAlias"("agentId", "key");

-- AddForeignKey
ALTER TABLE "PenaltyImport" ADD CONSTRAINT "PenaltyImport_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyItem" ADD CONSTRAINT "PenaltyItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyItem" ADD CONSTRAINT "PenaltyItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PenaltyImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyItem" ADD CONSTRAINT "PenaltyItem_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyAlias" ADD CONSTRAINT "PenaltyAlias_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyAlias" ADD CONSTRAINT "PenaltyAlias_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

