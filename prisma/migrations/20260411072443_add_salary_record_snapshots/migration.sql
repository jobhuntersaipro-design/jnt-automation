-- AlterTable: add snapshot JSON columns and updatedAt to SalaryRecord
ALTER TABLE "SalaryRecord"
ADD COLUMN "weightTiersSnapshot" JSONB,
ADD COLUMN "incentiveSnapshot" JSONB,
ADD COLUMN "petrolSnapshot" JSONB,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now();
