# Person Identity — Phase A Dry-Run Report

Generated: 2026-04-22T10:37:51.756Z

## Summary

- **2** agents
- **172** dispatcher rows today → **166** unique persons after dedup
- **6** multi-branch transfers detected
- **3** clusters with settings conflicts to review
- **6** clusters matched by name alone (no IC) — needs user spot-check
- **1** IC collisions (same IC, different people) — needs data fix

## Agent: jobhunters.ai.pro@gmail.com (cmnpmpdn60002uubygrli3ssg)

Rows: 18 → projected unique persons: 18

_No transfers detected for this agent._

## Agent: xiangtransport@gmail.com (bab09161-a3d3-4c8b-8437-bc09523f7499)

Rows: 154 → projected unique persons: 148

### ⚠ IC collisions (1)

Records below share an IC but were **not merged** because their first names disagree. Most likely one row has the wrong IC. Fix the data (edit the IC on the wrong row in Settings) before running Phase B, otherwise these stay as separate persons.

#### Shared IC ****9101

| Branch / ExtId | Name as stored |
|---|---|
| PHG379 / PHG3795029 | ABDUL HAFIZ BIN YAP AFENDI |
| PHG415 / PHG4155068 | ABD HAKAM BIN CHE KAMIL |

### Multi-branch clusters (6)

#### MUHAMMAD ASRUL BIN MAZLAN ⚠ NAME-ONLY MATCH

Canonical row (latest updatedAt): PHG375/PHG3755049

| Branch / ExtId | IC | Name as stored | Updated | Created |
|---|---|---|---|---|
| PHG379 / PHG3795072 | **** | MUHAMMAD ASRUL BIN MAZLAN | 2026-04-12 | 2026-04-12 |
| **PHG375 / PHG3755049** | — | MUHAMMAD ASRUL BIN MAZLAN | 2026-04-13 | 2026-04-13 |

**Settings conflicts — canonical row's values will win in Phase B:**

- Incentive rule differs:
    - PHG379/PHG3795072: ≥2000 orders → RM300.00
    - PHG375/PHG3755049: ≥2000 orders → RM200.00

#### MUHAMMAD TAUFIQ BIN ZUBIR ⚠ NAME-ONLY MATCH

Canonical row (latest updatedAt): PHG375/PHG3755043

| Branch / ExtId | IC | Name as stored | Updated | Created |
|---|---|---|---|---|
| PHG379 / PHG3795002 | **** | MUHAMMAD TAUFIQ BIN ZUBIR | 2026-04-12 | 2026-04-12 |
| **PHG375 / PHG3755043** | — | MUHAMMAD TAUFIQ BIN ZUBIR | 2026-04-12 | 2026-04-12 |

**Settings conflicts — canonical row's values will win in Phase B:**

- Incentive rule differs:
    - PHG379/PHG3795002: ≥2000 orders → RM300.00
    - PHG375/PHG3755043: ≥2000 orders → RM200.00

#### KAMIL AZMAN BIN ABDUL MALIK ⚠ NAME-ONLY MATCH

Canonical row (latest updatedAt): PHG379/PHG3795067

| Branch / ExtId | IC | Name as stored | Updated | Created |
|---|---|---|---|---|
| PHG375 / PHG3755051 | — | KAMIL AZMAN BIN ABDUL MALIK | 2026-04-12 | 2026-04-12 |
| **PHG379 / PHG3795067** | — | KAMIL AZMAN BIN ABDUL MALIK | 2026-04-13 | 2026-04-13 |

#### AFZALRULLAH BIN ISHARUM ⚠ NAME-ONLY MATCH

Canonical row (latest updatedAt): PHG379/PHG3795070

| Branch / ExtId | IC | Name as stored | Updated | Created |
|---|---|---|---|---|
| PHG375 / PHG3755042 | — | AFZALRULLAH BIN ISHARUM | 2026-04-12 | 2026-04-12 |
| **PHG379 / PHG3795070** | — | AFZALRULLAH BIN ISHARUM | 2026-04-13 | 2026-04-13 |

**Settings conflicts — canonical row's values will win in Phase B:**

- Petrol rule differs:
    - PHG375/PHG3755042: eligible, ≥70/day → RM14.99
    - PHG379/PHG3795070: eligible, ≥70/day → RM15.00

#### AHMAD KAMARUL AFFIZAN BIN KAMARUDIN ⚠ NAME-ONLY MATCH

Canonical row (latest updatedAt): PHG379/PHG3795069

| Branch / ExtId | IC | Name as stored | Updated | Created |
|---|---|---|---|---|
| PHG375 / PHG3755029 | — | AHMAD KAMARUL AFFIZAN BIN KAMARUDIN | 2026-04-12 | 2026-04-12 |
| **PHG379 / PHG3795069** | — | AHMAD KAMARUL AFFIZAN BIN KAMARUDIN | 2026-04-13 | 2026-04-13 |

#### NURUL EMYRA SHAHIRAH BINTI OMAR ⚠ NAME-ONLY MATCH

Canonical row (latest updatedAt): PHG415/PHG4150040

| Branch / ExtId | IC | Name as stored | Updated | Created |
|---|---|---|---|---|
| PHG350 / PHG3505002 | — | NURUL EMYRA SHAHIRAH BINTI OMAR | 2026-04-12 | 2026-04-12 |
| **PHG415 / PHG4150040** | — | NURUL EMYRA SHAHIRAH BINTI OMAR | 2026-04-13 | 2026-04-13 |

---

## Next steps

Review the clusters above. Pay close attention to:

1. **Name-only matches** (⚠) — confirm they really are the same person. Two different humans with identical names and no IC would be wrongly merged. If any look wrong, flag them before we run the Phase B backfill.
2. **Settings conflicts** — the canonical row's values will win. If you want different rules to survive on a particular cluster, update that dispatcher's settings on the canonical row before running Phase B.
3. **Projected person count** — does the after-dedup number match your intuition of how many real humans you employ?

Once reviewed, sign off and we'll run the Phase B backfill to consolidate the data.