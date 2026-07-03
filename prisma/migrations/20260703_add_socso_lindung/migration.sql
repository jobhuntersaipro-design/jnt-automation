-- Add SOCSO "Lindung 24 Jam" (Non-Employment Injury / SKBBK) employee share to
-- EmployeeSalaryRecord.
--
-- This is the second employee SOCSO component under the "New Contribution Rate
-- Including SKBBK" schedule (First Category → Employee Share → Non-Employment
-- Injury). It is deducted from the employee alongside socsoEmployee, so total
-- employee SOCSO = socsoEmployee + socsoLindung.
--
-- Default 0 so existing saved months backfill cleanly and keep their stored
-- netSalary until the month is re-saved (at which point Lindung is computed
-- from the bracket and deducted).

ALTER TABLE "EmployeeSalaryRecord" ADD COLUMN "socsoLindung" DOUBLE PRECISION NOT NULL DEFAULT 0;
