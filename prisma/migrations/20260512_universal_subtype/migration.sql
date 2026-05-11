-- Add 4 new EmployeeType enum values + collapse the two role-specific
-- subtype columns (storeKeeperSubtype, adminSubtype) into a single universal
-- Employee.subtype column.
--
-- Pay-model semantics are preserved byte-for-byte: the application-level
-- gate (`computeEmployeeSalaryForSave`) now reads `subtype` instead of the
-- two role-specific columns, but the same null-vs-PERMANENT-vs-TEMPORARY
-- transitions produce identical pay-model decisions for STORE_KEEPER + ADMIN.

-- 1. Extend the EmployeeType enum. ADD VALUE IF NOT EXISTS is idempotent.
ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'MARKETING';
ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'ASSISTANT';
ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'QUALITY_CONTROL';
ALTER TYPE "EmployeeType" ADD VALUE IF NOT EXISTS 'ACCOUNT_EXECUTIVE';

-- 2. Add the new universal subtype column.
ALTER TABLE "Employee" ADD COLUMN "subtype" "StoreKeeperSubtype";

-- 3. Backfill from the two legacy columns. They can't both be set
--    (existing API validators rejected cross-role values), so COALESCE
--    is safe.
UPDATE "Employee"
   SET "subtype" = COALESCE("storeKeeperSubtype", "adminSubtype")
 WHERE "storeKeeperSubtype" IS NOT NULL OR "adminSubtype" IS NOT NULL;

-- 4. Drop the legacy columns.
ALTER TABLE "Employee" DROP COLUMN "storeKeeperSubtype";
ALTER TABLE "Employee" DROP COLUMN "adminSubtype";
