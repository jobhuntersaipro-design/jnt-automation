# Staff Page — Phase 2: Dispatcher Settings Drawer

## Overview

Fill in the side drawer with full dispatcher settings. Agent can view and edit
all mandatory and optional fields per dispatcher. Auto-saves on change.

## What You Can Do After This Phase

- View and edit a dispatcher's IC number
- View and edit all 3 weight tiers (min weight, max weight, commission)
- View and edit incentive rule (order threshold + incentive amount)
- View and edit petrol rule (eligibility toggle, daily threshold, subsidy amount)
- See gender auto-derived from IC number (no manual gender field)
- See "Incomplete" badge resolve to "Complete" once all mandatory fields are filled
- All changes auto-saved to DB with a toast confirmation

---

## Drawer Layout

### Header
- Avatar (initials + gender ring, sized `lg`)
- Dispatcher name + extId
- Branch chip
- Close button (×)
- "Incomplete" badge if mandatory fields missing — disappears once complete

### Body — Sections

#### 1. Identity
| Field | Type | Mandatory |
|---|---|---|
| IC Number | Text input | ✅ |
| Gender | Read-only derived field | — |

Gender display: "Male" or "Female" shown as a read-only label below IC input,
derived live as the user types (last digit odd = Male, even = Female, incomplete = "—").

#### 2. Weight Tiers
3 rows, one per tier. Each row:
| Field | Type | Notes |
|---|---|---|
| Min Weight (kg) | Number input | Tier 1 locked at 0 |
| Max Weight (kg) | Number input | Tier 3 shows "∞" — input disabled |
| Commission (RM) | Number input | Per parcel flat rate |

Pre-filled with defaults on new dispatcher: 0–5kg→RM1.00, 5.01–10kg→RM1.40, 10.01+→RM2.20

#### 3. Monthly Incentive
| Field | Type | Mandatory |
|---|---|---|
| Order Threshold | Number input | ✅ (default: 2000) |
| Incentive Amount (RM) | Number input | ✅ (no default — must be set) |

#### 4. Petrol Subsidy
| Field | Type | Mandatory |
|---|---|---|
| Eligible | Toggle (on/off) | ✅ |
| Daily Threshold | Number input | ✅ (default: 70, shown only if eligible = true) |
| Subsidy Amount (RM) | Number input | ✅ (default: RM15, shown only if eligible = true) |

Daily threshold and subsidy amount fields hidden when eligible = false.

### Footer
- "Saved" indicator (green dot + "All changes saved") — shown after successful save
- No explicit save button — auto-save on blur/change

---

## Auto-Save Behaviour

- Trigger: `onBlur` on each input field, `onChange` on toggle
- Debounced 600ms to avoid saving on every keystroke
- On save: PATCH request to `/api/staff/[id]/settings`
- Success: toast "Changes saved" + green indicator in drawer footer
- Error: toast "Failed to save. Please try again." + revert field to last saved value

---

## Completeness Check

A dispatcher is **complete** when all of the following exist:
- `icNo` is filled
- All 3 `WeightTier` rows exist with valid values
- `IncentiveRule` exists with `incentiveAmount` set (not null/zero)
- `PetrolRule` exists (`isEligible` can be false — just needs to exist)

Recompute completeness after every save and update the badge in the drawer header
and the status column in the list behind it.

---

## API Routes

### `PATCH /api/staff/[id]/settings`

**Request body:**
```ts
{
  icNo?: string
  weightTiers?: Array<{
    tier: 1 | 2 | 3
    minWeight: number
    maxWeight: number | null
    commission: number
  }>
  incentiveRule?: {
    orderThreshold: number
    incentiveAmount: number
  }
  petrolRule?: {
    isEligible: boolean
    dailyThreshold: number
    subsidyAmount: number
  }
}
```

**Logic:**
- Partial updates supported — only send the section being changed
- Use `upsert` for `WeightTier`, `IncentiveRule`, `PetrolRule`
- Derive and save `gender` from `icNo` on every IC update
- Scope check: verify `dispatcher.branch.agentId === session.user.id`

**Response:** `{ success: true, isComplete: boolean }`

---

## Gender Derivation (client + server)

```ts
function deriveGender(icNo: string): "MALE" | "FEMALE" | "UNKNOWN" {
  const lastDigit = parseInt(icNo.slice(-1));
  if (isNaN(lastDigit)) return "UNKNOWN";
  return lastDigit % 2 !== 0 ? "MALE" : "FEMALE";
}
```

Run on client for live preview. Also run on server before saving to DB.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/components/staff/dispatcher-drawer.tsx` | Modify — add full settings form |
| `src/components/staff/weight-tier-section.tsx` | Create — 3-row weight tier inputs |
| `src/components/staff/incentive-section.tsx` | Create — incentive rule inputs |
| `src/components/staff/petrol-section.tsx` | Create — petrol rule inputs with toggle |
| `src/app/api/staff/[id]/settings/route.ts` | Create — PATCH settings |
| `src/lib/db/staff.ts` | Modify — add `getDispatcherById` for drawer data |
| `src/lib/utils/gender.ts` | Create — `deriveGender` utility |

---

## Testing

1. Click dispatcher row → drawer opens with all current values pre-filled
2. Edit IC number → gender label updates live below the field
3. IC number with odd last digit → gender shows "Male", avatar ring turns blue
4. IC number with even last digit → gender shows "Female", avatar ring turns pink
5. Edit commission on tier 2 → auto-saves after blur, toast shown
6. Edit incentive amount → saves, "Saved" indicator appears in footer
7. Toggle petrol eligibility off → daily threshold + subsidy fields hide
8. Toggle petrol eligibility on → daily threshold + subsidy fields reappear
9. Leave incentive amount empty → dispatcher stays "Incomplete"
10. Fill all mandatory fields → "Incomplete" badge disappears, list shows "Complete"
11. Simulate save failure → toast shown, field reverts to previous value
12. Verify saved values persist after closing and reopening drawer
13. Verify another agent cannot PATCH a dispatcher that isn't theirs (403)

## Status

Not started. Complete Phase 1 first.
