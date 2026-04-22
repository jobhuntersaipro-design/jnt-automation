/**
 * Phase 1 (red) test for Sheets removal.
 * Spec: context/features/sheets-removal-downloads-center-drawer-spec.md (P1-T1)
 *
 * Asserts that the Prisma schema has no `googleSheets*` fields on the Agent
 * model. Red today (the three fields are present); goes green after Phase 2
 * edits the schema and the drop-column migration lands.
 *
 * This is a lightweight file-contents check — no DB roundtrip. A
 * column-existence SQL assertion would need a live DB connection that
 * vitest doesn't have wired up in this project.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("prisma/schema.prisma — Google Sheets fields (P1-T1)", () => {
  const schema = readFileSync(
    join(__dirname, "..", "..", "..", "prisma", "schema.prisma"),
    "utf8",
  );

  it("has no googleSheetsAccessToken field", () => {
    expect(schema).not.toMatch(/googleSheetsAccessToken/);
  });

  it("has no googleSheetsRefreshToken field", () => {
    expect(schema).not.toMatch(/googleSheetsRefreshToken/);
  });

  it("has no googleSheetsTokenExpiry field", () => {
    expect(schema).not.toMatch(/googleSheetsTokenExpiry/);
  });

  it("ships the drop-google-sheets-fields migration", () => {
    // The migration file must exist so `prisma migrate deploy` is authoritative
    // in prod — prevents hand-editing schema.prisma without a migration.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const migrationsDir = path.join(__dirname, "..", "..", "..", "prisma", "migrations");
    const entries = fs.readdirSync(migrationsDir);
    const dropMigration = entries.find((e) =>
      /drop.*google[-_]sheets/i.test(e),
    );
    expect(dropMigration).toBeDefined();
  });
});
