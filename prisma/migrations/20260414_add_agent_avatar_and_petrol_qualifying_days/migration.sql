-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "avatarUrl" TEXT;

-- AlterTable
ALTER TABLE "SalaryRecord" ADD COLUMN "petrolQualifyingDays" INTEGER NOT NULL DEFAULT 0;
