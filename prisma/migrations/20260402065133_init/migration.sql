-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatcher" (
    "id" TEXT NOT NULL,
    "extId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icNo" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "avatarUrl" TEXT,
    "branchId" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightTier" (
    "id" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "minWeight" DOUBLE PRECISION NOT NULL,
    "maxWeight" DOUBLE PRECISION,
    "commission" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WeightTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveRule" (
    "id" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "orderThreshold" INTEGER NOT NULL DEFAULT 2000,
    "incentiveAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "IncentiveRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetrolRule" (
    "id" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "isEligible" BOOLEAN NOT NULL DEFAULT false,
    "dailyThreshold" INTEGER NOT NULL DEFAULT 70,
    "subsidyAmount" DOUBLE PRECISION NOT NULL DEFAULT 15,

    CONSTRAINT "PetrolRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryRecord" (
    "id" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "incentive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "petrolSubsidy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netSalary" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryLineItem" (
    "id" TEXT NOT NULL,
    "salaryRecordId" TEXT NOT NULL,
    "waybillNumber" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "deliveryDate" TIMESTAMP(3),

    CONSTRAINT "SalaryLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE INDEX "Account_agentId_idx" ON "Account"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_agentId_idx" ON "Session"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Branch_agentId_idx" ON "Branch"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_agentId_code_key" ON "Branch"("agentId", "code");

-- CreateIndex
CREATE INDEX "Dispatcher_branchId_idx" ON "Dispatcher"("branchId");

-- CreateIndex
CREATE INDEX "Dispatcher_extId_idx" ON "Dispatcher"("extId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatcher_branchId_extId_key" ON "Dispatcher"("branchId", "extId");

-- CreateIndex
CREATE INDEX "WeightTier_dispatcherId_idx" ON "WeightTier"("dispatcherId");

-- CreateIndex
CREATE UNIQUE INDEX "WeightTier_dispatcherId_tier_key" ON "WeightTier"("dispatcherId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveRule_dispatcherId_key" ON "IncentiveRule"("dispatcherId");

-- CreateIndex
CREATE UNIQUE INDEX "PetrolRule_dispatcherId_key" ON "PetrolRule"("dispatcherId");

-- CreateIndex
CREATE INDEX "Upload_branchId_idx" ON "Upload"("branchId");

-- CreateIndex
CREATE INDEX "Upload_month_year_idx" ON "Upload"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_branchId_month_year_key" ON "Upload"("branchId", "month", "year");

-- CreateIndex
CREATE INDEX "SalaryRecord_dispatcherId_idx" ON "SalaryRecord"("dispatcherId");

-- CreateIndex
CREATE INDEX "SalaryRecord_uploadId_idx" ON "SalaryRecord"("uploadId");

-- CreateIndex
CREATE INDEX "SalaryRecord_month_year_idx" ON "SalaryRecord"("month", "year");

-- CreateIndex
CREATE INDEX "SalaryRecord_dispatcherId_month_year_idx" ON "SalaryRecord"("dispatcherId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryRecord_dispatcherId_uploadId_key" ON "SalaryRecord"("dispatcherId", "uploadId");

-- CreateIndex
CREATE INDEX "SalaryLineItem_salaryRecordId_idx" ON "SalaryLineItem"("salaryRecordId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatcher" ADD CONSTRAINT "Dispatcher_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightTier" ADD CONSTRAINT "WeightTier_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveRule" ADD CONSTRAINT "IncentiveRule_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetrolRule" ADD CONSTRAINT "PetrolRule_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryRecord" ADD CONSTRAINT "SalaryRecord_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryLineItem" ADD CONSTRAINT "SalaryLineItem_salaryRecordId_fkey" FOREIGN KEY ("salaryRecordId") REFERENCES "SalaryRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
