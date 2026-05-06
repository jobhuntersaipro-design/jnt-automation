-- Add StoreKeeperSubtype enum + Employee.storeKeeperSubtype column.
--
-- Sub-tag on existing STORE_KEEPER role (Temporary / Permanent). Column is
-- nullable — null for non-store-keepers and for existing store-keeper rows
-- (no backfill). API enforces null for any type other than STORE_KEEPER.

CREATE TYPE "StoreKeeperSubtype" AS ENUM ('TEMPORARY', 'PERMANENT');

ALTER TABLE "Employee" ADD COLUMN "storeKeeperSubtype" "StoreKeeperSubtype";
