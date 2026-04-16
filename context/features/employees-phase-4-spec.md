# Phase 4: Nav Restructure — Dispatchers + Staff with Tabs

## Overview

Reorganise the nav and routing to reflect the new two-page structure.
Current "Staff" page becomes "Dispatchers". New "Staff" page handles employees.
Both pages have Settings + Payroll tabs. Upload disappears from nav entirely.

## Expected Outcome

After this phase:
- Nav: `Overview | Dispatchers | Staff`
- Dispatchers page: Settings tab (dispatcher list) + Payroll tab (upload flow)
- Staff page: Settings tab (employee list) + Payroll tab (monthly salary entry)
- All existing routes updated
- No broken links

---

## Nav Change

```
Before:                    After:
Overview                   Overview
Payroll                    Dispatchers  ← renamed from Staff
Staff                      Staff        ← new employee page
Upload (removed earlier)
```

---

## Route Changes

| Old Route | New Route |
|---|---|
| `/staff` | `/dispatchers` |
| `/payroll` | `/dispatchers` (Payroll tab) |
| `/payroll/[uploadId]` | `/dispatchers/payroll/[uploadId]` |
| (new) | `/staff` — employee list |
| (new) | `/staff` (Payroll tab) — monthly entry |

---

## Dispatchers Page — Tab Structure

```
/dispatchers
  → Settings tab (default)
     Existing dispatcher list + all current functionality
  → Payroll tab
     Existing payroll page (upload → calculate → confirm → payslips)
```

Tab navigation using URL param or segment:
```
/dispatchers          → Settings tab
/dispatchers?tab=payroll  → Payroll tab
/dispatchers/payroll/[uploadId]  → Salary table for specific upload
```

---

## Staff Page — Tab Structure

```
/staff
  → Settings tab (default)
     Employee list (Phase 1)
  → Payroll tab
     Monthly salary entry (Phase 2 + 3)
```

```
/staff            → Settings tab
/staff?tab=payroll  → Payroll tab
```

---

## Files to Modify

| File | Action |
|---|---|
| `src/components/nav/nav-links.tsx` | Modify — update nav items |
| `src/app/(dashboard)/staff/page.tsx` | Rename → `/dispatchers/page.tsx` |
| `src/app/(dashboard)/payroll/page.tsx` | Move → Payroll tab inside `/dispatchers` |
| `src/app/(dashboard)/payroll/[uploadId]/page.tsx` | Move → `/dispatchers/payroll/[uploadId]/page.tsx` |
| `src/app/(dashboard)/staff/page.tsx` | Create new — employee page (from Phase 1) |
| All internal links to `/staff` | Update → `/dispatchers` |
| All internal links to `/payroll` | Update → `/dispatchers?tab=payroll` |
| `src/middleware.ts` | Update route protection for new paths |

---

## Testing

1. Nav shows Overview, Dispatchers, Staff
2. Click Dispatchers → Settings tab active, dispatcher list shown
3. Click Payroll tab → upload zone / payroll history shown
4. Click Staff → Settings tab active, employee list shown
5. Click Payroll tab → monthly salary entry shown
6. `/staff` old route → redirects to `/dispatchers`
7. `/payroll` old route → redirects to `/dispatchers?tab=payroll`
8. All existing dispatcher functionality works unchanged
9. All existing payroll functionality works unchanged
10. Middleware protects all new routes correctly
11. Active nav tab highlights correctly on all routes

## Status

Not started. Complete Phases 1–3 first.
