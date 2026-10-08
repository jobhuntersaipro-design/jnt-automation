-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "stats" JSONB;

-- AlterTable
ALTER TABLE "PayrollResult" ADD COLUMN     "warnings" JSONB;

