# Person Identity — Phase A Dry-Run Report

Generated: 2026-04-22T10:58:08.285Z

## Summary

- **2** agents
- **166** dispatcher rows today → **166** unique persons after dedup
- **0** multi-branch transfers detected
- **0** clusters with settings conflicts to review
- **0** clusters matched by name alone (no IC) — needs user spot-check
- **1** IC collisions (same IC, different people) — needs data fix

_No dispatcher appears in more than one branch. Phase B backfill would be a no-op for merging._

## Agent: jobhunters.ai.pro@gmail.com (cmnpmpdn60002uubygrli3ssg)

Rows: 18 → projected unique persons: 18

_No transfers detected for this agent._

## Agent: xiangtransport@gmail.com (bab09161-a3d3-4c8b-8437-bc09523f7499)

Rows: 148 → projected unique persons: 148

### ⚠ IC collisions (1)

Records below share an IC but were **not merged** because their first names disagree. Most likely one row has the wrong IC. Fix the data (edit the IC on the wrong row in Settings) before running Phase B, otherwise these stay as separate persons.

#### Shared IC ****9101

| Branch / ExtId | Name as stored |
|---|---|
| PHG379 / PHG3795029 | ABDUL HAFIZ BIN YAP AFENDI |
| PHG415 / PHG4155068 | ABD HAKAM BIN CHE KAMIL |

_No transfers detected for this agent._

---

## Next steps

Review the clusters above. Pay close attention to:

1. **Name-only matches** (⚠) — confirm they really are the same person. Two different humans with identical names and no IC would be wrongly merged. If any look wrong, flag them before we run the Phase B backfill.
2. **Settings conflicts** — the canonical row's values will win. If you want different rules to survive on a particular cluster, update that dispatcher's settings on the canonical row before running Phase B.
3. **Projected person count** — does the after-dedup number match your intuition of how many real humans you employ?

Once reviewed, sign off and we'll run the Phase B backfill to consolidate the data.