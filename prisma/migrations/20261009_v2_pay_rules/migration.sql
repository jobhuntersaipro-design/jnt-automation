-- CreateEnum
CREATE TYPE "Vehicle" AS ENUM ('BIKE', 'CAR', 'LORRY');

-- CreateEnum
CREATE TYPE "Employment" AS ENUM ('FULL_TIME', 'PART_TIME');

-- CreateEnum
CREATE TYPE "PayRuleKind" AS ENUM ('PARCEL', 'KPI', 'FUEL', 'SC', 'SC_RTN', 'ALLOWANCE', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateTable
CREATE TABLE "PayRule" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" "PayRuleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "effectiveFrom" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "source" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRuleAssignment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" "PayRuleKind" NOT NULL,
    "ruleId" TEXT NOT NULL,
    "branchId" TEXT,
    "dispatcherId" TEXT,
    "employment" "Employment",
    "effectiveFrom" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayRuleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatcherProfile" (
    "id" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "effectiveFrom" INTEGER NOT NULL,
    "vehicle" "Vehicle" NOT NULL,
    "employment" "Employment" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatcherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "fileName" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "parcelCount" INTEGER NOT NULL,
    "rules" JSONB,
    "calculatedAt" TIMESTAMP(3),
    "finalisedAt" TIMESTAMP(3),
    "finalisedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "extId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parcels" JSONB NOT NULL,
    "profile" JSONB,
    "lines" JSONB NOT NULL,
    "earningsCents" INTEGER NOT NULL DEFAULT 0,
    "deductionCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayrollResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleAudit" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "ruleId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayRule_agentId_kind_idx" ON "PayRule"("agentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PayRuleVersion_ruleId_effectiveFrom_key" ON "PayRuleVersion"("ruleId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayRuleAssignment_agentId_kind_idx" ON "PayRuleAssignment"("agentId", "kind");

-- CreateIndex
CREATE INDEX "PayRuleAssignment_ruleId_idx" ON "PayRuleAssignment"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatcherProfile_dispatcherId_effectiveFrom_key" ON "DispatcherProfile"("dispatcherId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayrollRun_agentId_period_idx" ON "PayrollRun"("agentId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_branchId_period_key" ON "PayrollRun"("branchId", "period");

-- CreateIndex
CREATE INDEX "PayrollResult_dispatcherId_idx" ON "PayrollResult"("dispatcherId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollResult_runId_dispatcherId_key" ON "PayrollResult"("runId", "dispatcherId");

-- CreateIndex
CREATE INDEX "RuleAudit_agentId_createdAt_idx" ON "RuleAudit"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "RuleAudit_ruleId_idx" ON "RuleAudit"("ruleId");

-- AddForeignKey
ALTER TABLE "PayRule" ADD CONSTRAINT "PayRule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRuleVersion" ADD CONSTRAINT "PayRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PayRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRuleAssignment" ADD CONSTRAINT "PayRuleAssignment_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PayRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRuleAssignment" ADD CONSTRAINT "PayRuleAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRuleAssignment" ADD CONSTRAINT "PayRuleAssignment_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatcherProfile" ADD CONSTRAINT "DispatcherProfile_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollResult" ADD CONSTRAINT "PayrollResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollResult" ADD CONSTRAINT "PayrollResult_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleAudit" ADD CONSTRAINT "RuleAudit_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

