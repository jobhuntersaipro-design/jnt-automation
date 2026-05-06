-- Add PayMode enum + EmployeeSalaryRecord.payMode column.
--
-- Temporary store keepers can be billed by HOUR or by DAY. The math is
-- identical (units × rate); only the payslip line label and per-row UI
-- toggle change. Null payMode means HOUR (back-compat for rows saved
-- before this column existed).

CREATE TYPE "PayMode" AS ENUM ('HOUR', 'DAY');

ALTER TABLE "EmployeeSalaryRecord" ADD COLUMN "payMode" "PayMode";
