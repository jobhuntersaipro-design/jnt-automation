-- CreateTable
CREATE TABLE "BranchLimitChange" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "fromLimit" INTEGER NOT NULL,
    "toLimit" INTEGER NOT NULL,
    "changedBy" TEXT NOT NULL,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchLimitChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchLimitChange_agentId_createdAt_idx" ON "BranchLimitChange"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "BranchLimitChange" ADD CONSTRAINT "BranchLimitChange_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

