# Person Identity Model — Spec

## Problem

Today a `Dispatcher` row is branch-scoped: one row per (branch, dispatcher ID from J&T). When the same human transfers between branches, J&T assigns them a fresh ext-ID in the new branch, so they appear as two unrelated rows in our system.

Real example from the data: `AHMAD KAMARUL AFFIZA` exists as `PHG3795069` in branch `PHG379` (Jan 2026) and `PHG3755029` in branch `PHG375` (Feb 2026). Same human, two independent records, two sets of settings that can silently drift, fragmented YTD history, and an inflated headcount ("133 dispatchers" includes duplicates).

## Goal

Treat a dispatcher as a **person** with one canonical record per agent. Their presence in a branch is a separate concept — a **branch assignment**. Settings (weight tiers, incentive, petrol) are person-level and apply wherever they work.

Success looks like:

- One row per unique person in the Settings list
- Branch column shows current + past branches, with the transfer visible
- History drawer merges salary records across branches into one timeline
- Editing rules for Ahmad updates them once, regardless of branch
- Headcount reflects unique humans, not (human × branch) combinations
- Uploads from a branch the person has worked in before re-use the existing person record automatically

## Non-goals

- We do **not** unify salary record rows across branches. Each month × branch upload continues to produce its own `SalaryRecord` — payroll is branch-scoped because the raw data is branch-scoped, and snapshots must stay intact.
- We do **not** auto-resolve settings conflicts during the migration without user review. The dry-run report lists conflicts for the user to decide the winner.
- No changes to the Payroll, Employee, or Overview features beyond what's needed to point at the new model.

## Matching rule (person identity)

Tiered, applied both in the one-time backfill and in every future Excel ingest:

1. **IC match (preferred)** — if `icNo` is present and non-empty, two records with the same `icNo` under the same agent = same person. Name differences allowed (typos, naming variants).
2. **Name fallback** — if IC is missing on either side, match on `normalize(fullName)` (trim, collapse internal whitespace, uppercase). Agent-scoped.
3. **No match** — create a new person.

Matching is always agent-scoped — we never collapse across tenants.

### Normalization

```ts
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}
```

Stored as `Dispatcher.normalizedName`, indexed for cheap lookup.

### Known limitation

Name-only matching can produce **false merges** between two real people with identical names. Mitigations:

- Dry-run migration report surfaces every name-only match for user review before commit
- Future UI: a "split person" action if the user discovers a false merge after the fact (follow-up, not in this spec)

## Schema change

Keep the name `Dispatcher` (matches UI terminology and limits code churn). The `Dispatcher` entity becomes person-level. Branch-scoped data (`extId`, `branchId`) moves to a new `DispatcherAssignment` child table.

### Before

```prisma
model Dispatcher {
  id        String  @id @default(cuid())
  extId     String
  name      String
  icNo      String
  gender    Gender
  avatarUrl String?
  branchId  String
  isPinned  Boolean @default(false)

  branch        Branch         @relation(fields: [branchId], references: [id], onDelete: Cascade)
  weightTiers   WeightTier[]
  incentiveRule IncentiveRule?
  petrolRule    PetrolRule?
  salaryRecords SalaryRecord[]
  employees     Employee[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, extId])
  @@index([branchId])
  @@index([extId])
}
```

### After

```prisma
model Dispatcher {
  id             String  @id @default(cuid())
  agentId        String  // NEW: direct ownership (was inherited via branch)
  name           String
  normalizedName String  // NEW: UPPER(TRIM(COLLAPSE_WS(name))), for name fallback match
  icNo           String? // was required; now optional — matches reality
  gender         Gender  @default(UNKNOWN)
  avatarUrl      String?
  isPinned       Boolean @default(false)

  agent         Agent                  @relation(fields: [agentId], references: [id], onDelete: Cascade)
  assignments   DispatcherAssignment[]
  weightTiers   WeightTier[]
  incentiveRule IncentiveRule?
  petrolRule    PetrolRule?
  salaryRecords SalaryRecord[]
  employees     Employee[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([agentId])
  @@index([agentId, icNo])
  @@index([agentId, normalizedName])
}

model DispatcherAssignment {
  id           String    @id @default(cuid())
  dispatcherId String
  branchId     String
  extId        String    // branch-scoped J&T ID
  startedAt    DateTime  @default(now())
  endedAt      DateTime? // null = still assigned

  dispatcher Dispatcher @relation(fields: [dispatcherId], references: [id], onDelete: Cascade)
  branch     Branch     @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([branchId, extId])
  @@index([dispatcherId])
  @@index([branchId])
}
```

### FKs that stay pointing at `Dispatcher`

- `WeightTier.dispatcherId` — settings are person-level. No change.
- `IncentiveRule.dispatcherId` — same.
- `PetrolRule.dispatcherId` — same.
- `SalaryRecord.dispatcherId` — now refers to person. `@@unique([dispatcherId, uploadId])` still holds because each upload is one branch-month, so Ahmad's April payroll at PHG379 and at PHG375 are two separate records tied to two separate uploads.
- `Employee.dispatcherId` — now refers to person. An employee's "also a dispatcher" link is person-level, which is correct.

### Data fields that move

| Field | From | To |
|---|---|---|
| `extId` | `Dispatcher` | `DispatcherAssignment` |
| `branchId` | `Dispatcher` | `DispatcherAssignment` |
| `@@unique([branchId, extId])` | `Dispatcher` | `DispatcherAssignment` |

### Data fields that are new

- `Dispatcher.agentId` — directly owned by the agent instead of inherited via `branch → agent`
- `Dispatcher.normalizedName` — derived column for fallback matching
- `DispatcherAssignment.startedAt` / `endedAt` — lifecycle of a branch assignment

### `icNo` becomes optional

Current schema has `icNo String` (required) but the live data often stores `""` (empty string) — the UI renders these as `—`. Migration converts `""` → `NULL`.

## Migration

Two-phase: a dry-run report, then a commit step gated on user approval.

### Phase 1 — dry-run (no writes)

Script: `scripts/person-identity-dry-run.ts`

1. Load every `Dispatcher` row, scoped by agent.
2. Group using the tiered matching rule.
3. Emit a report (printed + written to `docs/audit-results/person-identity-dry-run.md`):
   - Per agent: total rows → unique persons projected
   - Groups with ≥2 rows (the ones that will merge) — listed with names, ICs, branches, extIds
   - Within each multi-row group: settings diff (tiers, incentive, petrol) — highlights rows where the settings disagree
   - Name-only match warnings — multi-row groups that matched on `normalizedName` because IC was missing, flagged for user spot-check
   - Summary counts: `X agents · Y dispatcher rows → Z unique persons · N multi-branch transfers · M settings conflicts · K name-only matches`

The user reviews the report and signs off before Phase 2.

### Phase 2 — schema + backfill (single Prisma migration + data script)

One Prisma migration that runs in this order:

1. Add `DispatcherAssignment` table.
2. Add `Dispatcher.agentId`, `Dispatcher.normalizedName`.
3. Make `Dispatcher.icNo` nullable; convert `""` → `NULL`.
4. Backfill script (SQL in the migration, or a separate transactional TS script run after):
   1. For each agent, group dispatchers by tiered match.
   2. For each group of size `n`:
      - Pick the **canonical** dispatcher row = the one with the most recent `updatedAt` (ties broken by earliest `createdAt` — oldest row wins the tie).
      - For each non-canonical row in the group:
        - Create a `DispatcherAssignment` using its `branchId` + `extId`, pointing to the canonical dispatcher.
        - Re-point `SalaryRecord.dispatcherId` → canonical dispatcher.
        - Re-point `Employee.dispatcherId` → canonical dispatcher.
        - Delete the `WeightTier` / `IncentiveRule` / `PetrolRule` rows belonging to the non-canonical dispatcher (canonical row's settings win — this matches the dry-run report's conflict column).
        - Delete the non-canonical `Dispatcher` row.
      - Create a `DispatcherAssignment` for the canonical row's own `branchId` + `extId`.
   3. Backfill `normalizedName` for every surviving `Dispatcher`.
   4. Backfill `agentId` on every surviving `Dispatcher` from its original branch's `agentId`.
5. Drop `Dispatcher.extId`, `Dispatcher.branchId`, and the old unique + indexes.

### Safety

- Entire backfill runs inside a single transaction per agent. Either the agent's data is fully migrated or it's fully rolled back.
- Uses Prisma migrations (never `db push` — per project rules).
- Development branch first, verified via dry-run + smoke tests, then `prisma migrate deploy` to prod during a low-traffic window.
- Full DB snapshot taken before prod migration (manual Neon branch clone).

## Ingest pipeline changes

Location: `src/lib/upload/pipeline.ts` and `src/lib/upload/dispatcher-check.ts`.

Current flow: for each unique `(branchId, extId)` in the uploaded Excel, check if a `Dispatcher` row exists with that pair; if not, it's flagged as an "unknown dispatcher" and the user is prompted via `CONFIRM_SETTINGS`.

New flow: for each `(branchId, extId, name)` triple in the Excel:

1. Look up `DispatcherAssignment` by `(branchId, extId)`.
2. If found → known assignment, proceed.
3. If not found → try person match (tiered rule, agent-scoped) using IC (if any column carries it — today's raw data doesn't, so this path is name-only during ingest).
4. If person found → create a new `DispatcherAssignment` for this person at the new branch. Log a "transfer detected" event. No user prompt — the person already has all mandatory settings.
5. If no person found → show `CONFIRM_SETTINGS` as today. On confirm, create both a `Dispatcher` (person) and their first `DispatcherAssignment`.

### Edge case — same month, both branches

If the raw data has Ahmad delivering parcels in both PHG379 and PHG375 in April (e.g. mid-month transfer), we get two `SalaryRecord`s (one per upload), both pointing at the same person. That's correct — the history drawer displays them as two entries under April with branch badges.

## UI changes

### Settings tab (`/dispatchers`)

- **Row = person**, not (person, branch). Counter drops to unique-person count.
- **Branch column** replaced with an assignment chip group:
  - Current branch (bold, primary color): `PHG375`
  - Past branches (muted): `was PHG379 (Jan)`
  - Hover the chip → tooltip shows assignment range
- **Add Dispatcher drawer** — branch field becomes "Starting Branch" since we're creating a person + their first assignment.
- **Delete** — deletes the person and cascades all assignments + settings + historical salary records. Confirmation dialog flags the blast radius ("This person has 2 branch assignments and 14 salary records").

### History drawer

- Merges `SalaryRecord`s across branches into one YTD timeline.
- Each monthly row gets a branch badge pill next to the month (`April 2026 · PHG375`).
- Summary hero: YTD net = sum across all branches.
- Inline recalculate still works — it updates the one salary record for that specific month-branch.

### Payroll tab (no change)

Per-branch, per-month uploads continue unchanged. The salary table still shows dispatchers at the selected branch — under the hood it queries via `DispatcherAssignment` for that branch.

### Employees tab

Employee drawer's "Also a dispatcher" toggle now searches person records (no branch field needed in the search result row — we show current branch as context).

## API changes

| Endpoint | Change |
|---|---|
| `GET /api/staff` (or equivalent in `src/lib/db/staff.ts`) | Return person rows with `assignments[]` instead of branch-scoped rows. |
| `POST /api/staff` | Creates person + first assignment atomically. |
| `DELETE /api/staff/[id]` | Cascades assignments + settings + salary records. |
| `PATCH /api/staff/[id]/settings` | No change — settings are still keyed by `dispatcherId` which now means person. |
| `POST /api/staff/[id]/avatar` | No change. |
| `GET /api/staff/[id]/history` | Returns records across all branches; include branch code per record in response. |
| `POST /api/staff/[id]/recalculate` | No change — salary records are still per-upload. |
| `POST /api/upload/[uploadId]/setup-dispatchers` | Payload now creates persons + assignments instead of branch-scoped dispatchers. |
| `POST /api/dispatchers/month-detail/bulk/start` | No change — still iterates per-month-per-branch salary records. |
| `GET /api/overview/export/csv` and `/sheets` | The "Dispatcher" row in exports now de-duplicates; we may want a separate "Branch Assignment" export for advanced use. Out of scope for v1 — current behavior just lists unique persons with their current branch. |

## Tests

### Unit tests (new)

- `src/lib/dispatcher-identity/__tests__/matcher.test.ts` — the tiered matcher function: IC match, name fallback, namesake collision, normalization edge cases (trailing spaces, double spaces, mixed case, empty-string IC vs null IC).
- `src/lib/dispatcher-identity/__tests__/normalize-name.test.ts` — dedicated to normalization correctness.
- `src/lib/upload/__tests__/pipeline.test.ts` — extend with the "transfer detected" case: new `(branchId, extId)` but person matches existing record.

### Integration / migration tests

- `scripts/person-identity-dry-run.test.ts` — seeds a test DB with known duplicates + conflicts, runs the dry-run script, asserts the report structure.
- `scripts/person-identity-backfill.test.ts` — runs the backfill against a seeded test DB, asserts that:
  - Row counts shrink as expected
  - `SalaryRecord` and `Employee` FKs are re-pointed correctly
  - Settings (tiers, incentive, petrol) survive, taken from the canonical row
  - Assignments exist for every original `(branchId, extId)`

### Manual smoke

- Create two dispatchers with the same name in two branches on the dev DB, run the dry-run, eyeball the report.
- After backfill: confirm the UI shows one row with two branch chips, history drawer merges correctly, edits apply cross-branch.
- Run the full Excel upload for a month that spans both branches, confirm assignments + salary records are linked correctly.

## Risks

1. **False merges** — two real humans with identical names and no IC would be collapsed into one. Dry-run report is the last line of defense before commit. Long-term fix is IC adoption.
2. **Settings conflicts** — if Ahmad's rules differ across branches, the canonical row's rules win. The dry-run report lists every conflict with a side-by-side diff so the user can spot-check before commit.
3. **Cross-schema churn** — seven tables reference `Dispatcher` or get touched. Bugs in FK re-pointing during backfill could orphan salary records. The per-agent transaction wrapper + integration test on the backfill is the mitigation.
4. **Production backfill is a one-way door** — once `extId` is removed from `Dispatcher` and moved to `DispatcherAssignment`, rolling back means restoring from a pre-migration Neon branch snapshot. Snapshot explicitly before prod migration.
5. **Name normalization edge cases** — Malaysian names often have "bin"/"binti" variants, trailing tribal suffixes, or abbreviations. `UPPER(TRIM(COLLAPSE_WS(name)))` will not catch `AHMAD BIN ABDULLAH` vs `AHMAD B. ABDULLAH`. Accepted limitation for v1 — the dry-run report surfaces uncertain matches.

## Execution phases

Branch: `feature/person-identity-model`

1. **Phase A — schema + migration scaffolding (no UI)**
   - Prisma migration: add `DispatcherAssignment`, add `agentId`/`normalizedName`, make `icNo` nullable, don't drop old `extId`/`branchId` yet.
   - Backfill script (inline in migration or separate TS).
   - Dry-run script.
   - Unit + integration tests.
   - Run dry-run against dev DB → produce report → review with user.
2. **Phase B — commit the backfill**
   - Second migration drops `Dispatcher.extId`, `Dispatcher.branchId`, old unique/indexes.
   - Update `src/lib/db/staff.ts`, `src/lib/db/payroll.ts`, `src/lib/upload/*` to use the new shape.
   - Queries no longer reference `Dispatcher.branchId`; they go through `DispatcherAssignment`.
   - Tests updated + passing.
3. **Phase C — UI swap-over**
   - Settings tab row structure + branch chips.
   - History drawer cross-branch merge + badges.
   - Add Dispatcher drawer → person + assignment creation.
   - Delete confirmation blast-radius copy.
   - Manual smoke + `npm run build`.
4. **Phase D — prod deploy**
   - Take prod Neon snapshot.
   - `prisma migrate deploy`.
   - Run backfill script against prod.
   - Deploy app.

## Open questions

None — ready to branch once user approves.
