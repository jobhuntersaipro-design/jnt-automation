-- Add Employee.adminSubtype column.
--
-- Sub-tag on existing ADMIN role (Temporary / Permanent), parallel to the
-- existing storeKeeperSubtype column. Reuses the StoreKeeperSubtype enum
-- (TEMPORARY / PERMANENT). Column is nullable — null for non-admins and for
-- existing admin rows (no backfill: untagged admins continue to use basicPay,
-- matching today's behaviour). API enforces null for any type other than
-- ADMIN.

ALTER TABLE "Employee" ADD COLUMN "adminSubtype" "StoreKeeperSubtype";
