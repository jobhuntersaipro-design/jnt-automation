-- Employee.isActive: per-employee active/inactive flag.
--
-- Default `true` so existing employees stay active without a backfill.
-- The Settings tab exposes a per-row toggle; the list filter narrows the
-- view to active / inactive / all without affecting payroll behavior.

ALTER TABLE "Employee" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
