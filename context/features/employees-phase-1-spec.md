# Staff Page — Phase 1: Employee Settings

## Overview

Build the Staff page for managing non-dispatcher employees — Supervisor, Admin,
and Store Keeper. Each employee type has different salary fields. Employees are
managed separately from dispatchers. IC number is optional at setup — only
required when generating a payslip.

## Expected Outcome

After this phase:
- `/staff` page with employee list
- Add/edit/delete employees
- 3 employee types with different fields
- "Also a dispatcher" toggle — links employee to existing dispatcher by IC
- IC number optional until payslip generation
- Status: Complete / Missing IC

---

## Route

`/staff`

---

## Page Layout

### Header
- Page title: "Staff"
- Subtitle: "Manage your supervisors, admins and store keepers."
- "Add Employee" button (primary)

### Filter Bar
- Employee type filter: All / Supervisor / Admin / Store Keeper
- Search by name or IC number
- Employee count: "Showing 20 of 20 employees"

### Employee List

| Column | Content |
|---|---|
| Employee | Avatar (initials) + name + position |
| Type | Supervisor / Admin / Store Keeper chip |
| IC No | Masked last 4 digits or "Not set" |
| Also Dispatcher | Linked dispatcher extId or "—" |
| Status | Complete / Missing IC |
| Actions | Edit + Delete |

**Row interaction:** Click row → opens edit drawer

---

## Employee Types + Fields

### Supervisor & Admin

| Field | Mandatory | Notes |
|---|---|---|
| Full Name | ✅ | |
| IC Number | ❌ | Required for payslip only |
| Position | ✅ | Supervisor or Admin |
| Basic Pay (RM) | ✅ | Fixed monthly |
| Petrol Allowance (RM) | ❌ | Default 0 |
| KPI Allowance (RM) | ❌ | Default 0 |
| Other Allowance (RM) | ❌ | Default 0 |
| Also a Dispatcher | ❌ | Toggle — links to dispatcher profile |

### Store Keeper

| Field | Mandatory | Notes |
|---|---|---|
| Full Name | ✅ | |
| IC Number | ❌ | Required for payslip only |
| Position | ✅ | Store Keeper |
| Hourly Wage (RM) | ✅ | Rate per hour |
| KPI Allowance (RM) | ❌ | Default 0 |
| Petrol Allowance (RM) | ❌ | Default 0 |
| Other Allowance (RM) | ❌ | Default 0 |
| Also a Dispatcher | ❌ | Toggle — links to dispatcher profile |

---

## "Also a Dispatcher" Toggle

When enabled:
- Search field appears: "Search dispatcher by name or ID"
- Agent searches existing dispatcher from the Dispatchers page
- Once linked → shows dispatcher extId + branch on employee row
- When generating payslip → dispatcher commission pulled automatically from `SalaryRecord`
- IC number on employee profile synced to dispatcher profile (one source of truth)

When disabled:
- Employee payslip shows only employee earnings
- No commission pulled

---

## Status Logic

| State | Badge |
|---|---|
| IC filled | ✅ Complete |
| IC missing | 🟡 Missing IC |

Missing IC does not block salary entry or payroll — only blocks payslip PDF generation.
When agent tries to generate payslip with missing IC → prompt: "Please enter IC number to generate payslip."

---

## DB Model

```prisma
enum EmployeeType {
  SUPERVISOR
  ADMIN
  STORE_KEEPER
}

model Employee {
  id          String       @id @default(cuid())
  agentId     String
  name        String
  icNo        String?      // optional until payslip needed
  gender      Gender       @default(UNKNOWN)
  avatarUrl   String?
  position    String       // e.g. "Supervisor", "Store Keeper"
  type        EmployeeType

  // Supervisor/Admin fields
  basicPay        Float?
  petrolAllowance Float    @default(0)
  kpiAllowance    Float    @default(0)
  otherAllowance  Float    @default(0)

  // Store Keeper fields
  hourlyWage  Float?

  // Dispatcher link
  dispatcherId String?     // links to Dispatcher.id if also a dispatcher
  dispatcher   Dispatcher? @relation(fields: [dispatcherId], references: [id])

  agent        Agent       @relation(fields: [agentId], references: [id], onDelete: Cascade)
  salaryRecords EmployeeSalaryRecord[]

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([agentId])
}
```

```bash
npx prisma migrate dev --name add-employee-model
```

---

## API Routes

### `GET /api/staff`
Returns all employees for the agent.
```ts
Array<{
  id: string
  name: string
  icNo: string | null
  position: string
  type: EmployeeType
  basicPay: number | null
  hourlyWage: number | null
  petrolAllowance: number
  kpiAllowance: number
  otherAllowance: number
  dispatcherId: string | null
  dispatcherExtId: string | null
  isComplete: boolean  // icNo filled
}>
```

### `POST /api/staff`
Create new employee.

### `PATCH /api/staff/[id]`
Update employee fields. Partial update supported.
If `icNo` updated + `dispatcherId` linked → sync IC to dispatcher profile.

### `DELETE /api/staff/[id]`
Delete employee. Confirmation dialog first.

---

## Files to Create

| File | Action |
|---|---|
| `src/app/(dashboard)/staff/page.tsx` | Create — employee list page |
| `src/components/staff/employee-list.tsx` | Create — table with rows |
| `src/components/staff/employee-drawer.tsx` | Create — add/edit drawer |
| `src/components/staff/employee-filters.tsx` | Create — type filter + search |
| `src/lib/db/staff.ts` | Create — getEmployees query |
| `src/app/api/staff/route.ts` | Create — GET + POST |
| `src/app/api/staff/[id]/route.ts` | Create — PATCH + DELETE |

---

## Testing

1. Visit `/staff` → empty state shown
2. Click "Add Employee" → drawer opens
3. Select type Supervisor → correct fields shown
4. Select type Store Keeper → hourly wage shown instead of basic pay
5. Submit without name → validation error
6. Submit valid supervisor → appears in list
7. IC number blank → "Missing IC" badge shown
8. Fill IC number → "Complete" badge shown
9. Enable "Also a Dispatcher" → search field appears
10. Link to existing dispatcher → extId shown in list
11. Edit employee → drawer pre-filled with current values
12. Delete employee → confirmation dialog → removed from list
13. Filter by type → list filters correctly
14. Search by name → correct results
15. Verify data isolation — agent only sees own employees

## Status

Not started.
