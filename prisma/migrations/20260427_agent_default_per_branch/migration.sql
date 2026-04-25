-- AgentDefault: allow per-branch override rows.
--
-- Existing rows (one per agent) become the agent-level fallback —
-- branchId stays NULL and getAgentDefaults(agentId, branchId?) falls
-- back to them when no branch-specific override exists. New rows with
-- branchId set are the per-branch overrides edited from the Defaults
-- drawer's branch picker.
--
-- Postgres unique indexes treat NULLs as distinct, so the (agentId,
-- branchId) composite unique still allows multiple agentId rows where
-- branchId IS NULL. That's a footgun the application code is
-- responsible for not triggering — every "fallback" upsert must use
-- the same NULL row, and every "branch override" upsert must specify
-- a non-NULL branchId. The unique still catches the real case we
-- care about: two override rows for the same (agentId, branchId).

-- 1. Drop the old unique on agentId — defaults are no longer 1:1 with Agent.
--    Use IF EXISTS for both forms (constraint vs. plain unique index) so this
--    is robust to whichever shape the previous schema landed in.
ALTER TABLE "AgentDefault" DROP CONSTRAINT IF EXISTS "AgentDefault_agentId_key";
DROP INDEX IF EXISTS "AgentDefault_agentId_key";

-- 2. Add the optional branchId column.
ALTER TABLE "AgentDefault" ADD COLUMN "branchId" TEXT;

-- 3. FK to Branch — cascade delete so branch removal cleans up its
--    overrides automatically, matching how Branch cascades wipe
--    dispatchers/uploads/etc.
ALTER TABLE "AgentDefault"
  ADD CONSTRAINT "AgentDefault_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Composite unique + lookup index.
CREATE UNIQUE INDEX "AgentDefault_agentId_branchId_key"
  ON "AgentDefault"("agentId", "branchId");
CREATE INDEX "AgentDefault_agentId_idx" ON "AgentDefault"("agentId");
