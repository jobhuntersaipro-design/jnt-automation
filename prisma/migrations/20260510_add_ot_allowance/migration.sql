-- Add OT allowance column to Employee + EmployeeSalaryRecord.
--
-- Mirrors the existing KPI / petrol / other allowance pattern. OT is a
-- per-month overtime amount entered on the Staff payroll table; the
-- column on Employee is reserved for future template defaults (parity
-- with KPI) but is not currently surfaced in the employee drawer.
--
-- Default 0 so existing rows backfill cleanly without extra steps.

ALTER TABLE "Employee" ADD COLUMN "otAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "EmployeeSalaryRecord" ADD COLUMN "otAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0;
