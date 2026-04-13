-- AlterTable
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "googleSheetsAccessToken" TEXT,
ADD COLUMN IF NOT EXISTS "googleSheetsRefreshToken" TEXT,
ADD COLUMN IF NOT EXISTS "googleSheetsTokenExpiry" TIMESTAMP(3);
