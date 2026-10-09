-- v2 accounting export: account codes for the monthly payroll journal. Additive: a new table.
CREATE TABLE "JournalSetup" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "accounts" JSONB NOT NULL,
    "taxRate" TEXT NOT NULL DEFAULT 'No Tax',
    "tracking" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalSetup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JournalSetup_agentId_key" ON "JournalSetup"("agentId");

ALTER TABLE "JournalSetup" ADD CONSTRAINT "JournalSetup_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
