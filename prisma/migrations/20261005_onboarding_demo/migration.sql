-- Existing agents are already onboarded: backfill true, then default new rows to false.
ALTER TABLE "Agent" ADD COLUMN "hasSeenTutorial" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Agent" ALTER COLUMN "hasSeenTutorial" SET DEFAULT false;

ALTER TABLE "Branch" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
