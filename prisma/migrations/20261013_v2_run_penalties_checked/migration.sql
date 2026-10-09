-- v2 only, additive: when the month's penalties were checked for a payroll run.
ALTER TABLE "PayrollRun" ADD COLUMN "penaltiesCheckedAt" TIMESTAMP(3);
