-- Drop Google Sheets OAuth token columns from the Agent table.
-- The Google Sheets integration has been removed in favour of direct PDF
-- downloads — see context/features/sheets-removal-downloads-center-drawer-spec.md
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "googleSheetsAccessToken";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "googleSheetsRefreshToken";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "googleSheetsTokenExpiry";
