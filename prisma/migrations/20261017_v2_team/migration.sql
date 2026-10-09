-- v2 team members (branch supervisors). Additive: two columns on Agent, null/empty for every existing account.
ALTER TABLE "Agent" ADD COLUMN "ownerId" TEXT,
ADD COLUMN "teamBranchIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Agent" ADD CONSTRAINT "Agent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Agent_ownerId_idx" ON "Agent"("ownerId");
