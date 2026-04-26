-- Add DRIVER to the EmployeeType enum.
--
-- Driver is a fourth staff role alongside Supervisor / Admin / Store Keeper.
-- Pay model is monthly basic pay (same gating as Sup/Admin), so no other
-- schema change is needed. Existing rows are unaffected.

ALTER TYPE "EmployeeType" ADD VALUE 'DRIVER';
