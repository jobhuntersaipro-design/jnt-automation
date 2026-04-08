# Staff Page — Phase 1: UI Layout + Dispatcher List

## Overview

Build the Staff page UI with a filterable, searchable dispatcher list. Data from
real Neon DB via Prisma. No editing yet — list view only. Side drawer shell
(no content yet — Phase 2).

## What You Can Do After This Phase

- View all dispatchers across all branches
- Filter by branch
- Search by name or dispatcher ID
- Pin a dispatcher to the top of the list
- See dispatcher avatar (initials), name, ID, branch, gender ring
- Click a dispatcher row → side drawer opens (empty shell for now)
- Delete a dispatcher with confirmation dialog

---

## Route

`/staff`

---

## Page Layout

### Header
- Page title: "Staff"
- Subtitle: "Manage dispatchers and salary rules across all branches."
- Right side: "Add Dispatcher" button (primary, opens add dispatcher drawer — Phase 3)

### Filter Bar
- **Branch filter** — MultiSelect (same component as Overview). Shows all branches
  for the logged-in agent. Defaults to "All Branches".
- **Search input** — searches by dispatcher name or extId. Debounced 300ms.
- **Dispatcher count** — e.g. "Showing 18 of 18 dispatchers"

### Dispatcher List

Full-width table layout. Columns:

| Column | Content |
|---|---|
| Dispatcher | Avatar (initials + gender ring) + name + extId |
| Branch | Branch code chip |
| IC No | Masked: show last 4 digits only e.g. `••••••••1234` |
| Status | "Complete" (all mandatory fields filled) or "Incomplete" (missing fields) |
| Actions | Pin icon + Delete icon |

**Pinned dispatchers** float to the top of the list with a subtle `primary/10`
background tint and a filled pin icon.

**Row interaction:**
- Hover: `surface_container_high` background
- Click anywhere on row (except action icons) → opens side drawer

**Empty state:**
- No dispatchers at all: "No dispatchers yet. Add your first dispatcher."
- Search returns nothing: "No dispatchers match your search."

---

## Side Drawer Shell

Slides in from the right when a dispatcher row is clicked.
Width: `480px`. Overlay: `surface/60` backdrop.

**Contents (Phase 1 — shell only):**
- Header: dispatcher name + extId + close button (×)
- Body: placeholder text "Dispatcher settings coming soon."
- Footer: empty for now

Full drawer content implemented in Phase 2.

---

## Data Fetching

### `src/lib/db/staff.ts`

```ts
export async function getDispatchers(
  agentId: string,
  filters: { branchCodes?: string[]; search?: string }
): Promise<DispatcherRow[]>
```

**Query:**
```ts
prisma.dispatcher.findMany({
  where: {
    branch: { agentId },
    ...(branchCodes.length > 0 && { branch: { code: { in: branchCodes } } }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { extId: { contains: search, mode: "insensitive" } },
      ],
    }),
  },
  include: {
    branch: { select: { code: true } },
    weightTiers: { select: { id: true } },
    incentiveRule: { select: { id: true } },
    petrolRule: { select: { id: true } },
  },
  orderBy: [{ isPinned: "desc" }, { name: "asc" }],
})
```

**Returns per dispatcher:**
```ts
{
  id: string
  extId: string
  name: string
  icNo: string          // masked on the way out — show last 4 only
  gender: Gender
  avatarUrl: string | null
  isPinned: boolean
  branch: { code: string }
  isComplete: boolean   // true if weightTiers(3) + incentiveRule + petrolRule all exist
}
```

---

## API Routes

### `PATCH /api/staff/[id]/pin`
Toggle `isPinned` on a dispatcher.

**Response:** `{ isPinned: boolean }`

### `DELETE /api/staff/[id]`
Delete dispatcher with cascade (weight tiers, incentive rule, petrol rule,
salary records all deleted via Prisma cascade).

**Confirmation:** client shows dialog "Delete [name]? This cannot be undone."
**Response:** `{ success: true }`

---

## Page Architecture

```
/staff/page.tsx (server component)
  └── fetches branches + dispatchers
  └── StaffFilters (client) — branch filter + search
  └── DispatcherList (client) — table + pin/delete actions
  └── DispatcherDrawer (client) — side drawer shell
```

Filters pushed to URL as `searchParams` — same pattern as Overview page.

---

## Files to Create

| File | Action |
|---|---|
| `src/app/(dashboard)/staff/page.tsx` | Create — server component, fetches data |
| `src/lib/db/staff.ts` | Create — `getDispatchers` query |
| `src/components/staff/staff-filters.tsx` | Create — branch filter + search |
| `src/components/staff/dispatcher-list.tsx` | Create — table with rows |
| `src/components/staff/dispatcher-drawer.tsx` | Create — drawer shell |
| `src/app/api/staff/[id]/pin/route.ts` | Create — toggle pin |
| `src/app/api/staff/[id]/route.ts` | Create — DELETE dispatcher |

---

## Testing

1. Visit `/staff` — list renders with seeded dispatchers
2. Filter by branch — list updates to show only that branch's dispatchers
3. Search by name — matching dispatchers shown, others hidden
4. Search by extId — matching dispatcher shown
5. Search with no matches — empty state shown
6. Click pin icon on dispatcher — moves to top of list, icon fills
7. Click pin again — unpins, returns to normal position
8. Click dispatcher row — drawer opens with name + extId in header
9. Click × or outside drawer — drawer closes
10. Click delete icon — confirmation dialog appears
11. Confirm delete — dispatcher removed from list, toast shown
12. Cancel delete — nothing changes
13. Verify data isolation — logged-in agent only sees their own dispatchers

## Status

Not started.
