-- CreateEnum
CREATE TYPE "EmployeeType" AS ENUM ('SUPERVISOR', 'ADMIN', 'STORE_KEEPER');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icNo" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "avatarUrl" TEXT,
    "type" "EmployeeType" NOT NULL,
    "basicPay" DOUBLE PRECISION,
    "petrolAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kpiAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyWage" DOUBLE PRECISION,
    "dispatcherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_agentId_idx" ON "Employee"("agentId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "Dispatcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
