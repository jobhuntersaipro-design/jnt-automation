-- AlterTable: drop stale default on SalaryRecord.updatedAt (Prisma @updatedAt is app-managed)
ALTER TABLE "SalaryRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'CONFIRM_SETTINGS', 'NEEDS_ATTENTION', 'READY_TO_CONFIRM', 'FAILED', 'SAVED');

-- AlterTable: add status, errorMessage, updatedAt to Upload
ALTER TABLE "Upload" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now();
ALTER TABLE "Upload" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "Upload" ADD COLUMN "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADING';

-- Backfill existing uploads as SAVED (already confirmed data)
UPDATE "Upload" SET "status" = 'SAVED', "updatedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "Upload_status_idx" ON "Upload"("status");
