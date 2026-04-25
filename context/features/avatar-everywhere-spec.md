# Spec — Avatars Everywhere

> Display avatars in the branch-detail dispatcher + employee tables (read-only) and make the existing staff Settings + Payroll tables' avatars editable (upload / replace / delete) — same UX as the dispatcher list page.

## Scope

| Surface | Today | After |
| --- | --- | --- |
| `/branches/[code]` dispatcher table | name + extId only | + 32-px gender-ringed avatar in name cell |
| `/branches/[code]` employee table | name + position only | + 32-px gender-ringed avatar in name cell |
| `/staff?tab=settings` employee list | read-only `EmployeeAvatarView` | editable `DispatcherAvatar` (camera-on-hover, click → upload/replace/delete dialog) |
| `/staff?tab=payroll` payroll-tab table | read-only `EmployeeAvatarView` | editable `DispatcherAvatar` (same dialog) |

No design change to dispatcher list page. No payslip/PDF impact (avatars don't render in payslips today and won't start).

## Backend

### `getBranchDetail` (`src/lib/db/branches.ts`)

Extend both row types and the SELECT with `avatarUrl` + `gender`. Also need the linked dispatcher's `avatarUrl` for the employee row so display priority matches the rest of the app.

```ts
export type BranchDispatcherRow = {
  …existing…
  avatarUrl: string | null;
  gender: Gender;
};

export type BranchEmployeeRow = {
  …existing…
  avatarUrl: string | null;
  dispatcherAvatarUrl: string | null;   // FK-linked dispatcher's photo, wins on display
  gender: Gender;
};
```

`getBranchDetail` Prisma SELECT gains `avatarUrl, gender` on Dispatcher and `avatarUrl, gender, dispatcher: { select: { avatarUrl: true } }` on Employee.

### Editable avatar API endpoint selection

Routing rule used in both `/staff?tab=settings` and `/staff?tab=payroll`:

```ts
// Pure helper exported from src/lib/staff/avatar-target.ts
export function selectAvatarTarget(opts: {
  employeeId: string;
  dispatcherId: string | null;
}): { apiBasePath: string; subjectId: string } {
  if (opts.dispatcherId) {
    return {
      apiBasePath: `/api/staff/${opts.dispatcherId}/avatar`,
      subjectId: opts.dispatcherId,
    };
  }
  return {
    apiBasePath: `/api/employees/${opts.employeeId}/avatar`,
    subjectId: opts.employeeId,
  };
}
```

When `Employee.dispatcherId` FK is set, edits flow through the existing dispatcher avatar API — keeps the displayed photo (`dispatcherAvatarUrl ?? avatarUrl`) consistent with what gets persisted. When the FK is null, edits write to `Employee.avatarUrl` via the existing employee avatar API.

Name-matched-only employees (no FK) continue to use the employee's own avatar — they're a minority and the explicit FK is required for "shared photo" semantics.

### `GET /api/employee-payroll/[m]/[y]` payload

Add `dispatcherId: string | null` to each entry so the client can resolve the right edit target. Already loaded via `emp.dispatcher` include — just need to surface it.

## UI

### Branch detail tables (`src/app/(dashboard)/branches/[code]/page.tsx`)

Insert avatar before the name cell. Dispatcher table grid widens column 1 to fit a 32-px tile + name; same for employee table. Reuse `EmployeeAvatarView` (already supports `dispatcherAvatarUrl`) — read-only.

```diff
- <Link …>{d.name}</Link>
+ <div className="flex items-center gap-2.5">
+   <EmployeeAvatarView name={d.name} gender={d.gender} avatarUrl={d.avatarUrl} />
+   <Link …>{d.name}</Link>
+ </div>
```

Same pattern for employees, passing `dispatcherAvatarUrl={e.dispatcherAvatarUrl}` so the linked dispatcher's photo wins on display.

### Staff Payroll tab (`src/components/staff/payroll-tab.tsx`)

Replace the `<EmployeeAvatarView …>` at line 663 with `<DispatcherAvatar …>`, passing the resolved `apiBasePath` from `selectAvatarTarget`. Wire `onAvatarChange` to update the local `entries` state — depending on which target was used:

- If FK-linked: update `entry.dispatcherAvatarUrl` for *every* row whose `dispatcherId` matches (a single dispatcher could appear under multiple employee rows in theory, though the unique constraint usually keeps it 1:1).
- If employee-only: update `entry.avatarUrl` on that row.

Add `dispatcherId: string | null` to the `PayrollEntry` interface; populate from the GET response.

### Staff Settings employee list (`src/components/staff/employee-list.tsx`)

Same swap. The `StaffEmployee` type already exposes `dispatcherId` and `dispatcherAvatarUrl` and `avatarUrl`, so `selectAvatarTarget` plus a state-update callback is all that's needed. List is server-rendered; the client component `StaffEmployeesClient` already manages local state — wire `onAvatarChange` through to update its `employees` array (matching by `dispatcherId` for FK-linked edits).

### Linked-row tooltip

When `dispatcherId` is set, pass a custom `title` to `DispatcherAvatar` (already supported via the `title` prop): `"Editing the linked dispatcher's photo"`. Read-only branch detail keeps the default `name` tooltip.

## Tests (TDD)

### `src/lib/staff/__tests__/avatar-target.test.ts` (new)

Pure helper, 4 cases:

1. `dispatcherId` null → returns `/api/employees/<id>/avatar` with `subjectId = employeeId`.
2. `dispatcherId` set → returns `/api/staff/<dispatcherId>/avatar` with `subjectId = dispatcherId`.
3. Empty string `dispatcherId` is treated as null (defensive — coerces to employee API).
4. Switching between targets is pure: same input → same output (idempotency check).

### `src/lib/db/__tests__/branches-rows.test.ts` (new, optional)

Optional pure-helper test if we extract a row-shape mapper. Skip if the only change is a Prisma SELECT — no logic worth testing in isolation. (Kept open to add if mapping grows.)

### Existing tests

- 276 vitest cases must remain green.
- No new tests for the UI changes — they're presentational swaps to a heavily-tested existing component.

## Manual QA

1. Branch detail: open `/branches/QA001`. Both tables show 32-px gender-ringed avatars. Linked-employee rows show the dispatcher's photo when one is set.
2. Staff Settings: hover an employee row's avatar → camera overlay appears. Click → dialog opens. Upload a JPEG → avatar updates immediately. Click again → "Remove" works. Refresh page → state survives.
3. Staff Payroll: same flow on the same employee — confirm the avatar updates here too (shared `Employee.avatarUrl` or `dispatcher.avatarUrl`).
4. Linked employee (e.g. QA Supervisor with a dispatcher link): upload a new photo on the Staff page → the dispatcher's `/dispatchers` row also updates (same record).
5. Mobile (375px): edit dialog renders centred; avatar tile remains 32-px and readable in the dispatcher/employee tables (already validated for the existing `EmployeeAvatarView` ).

## Out of scope

- No payslip PDF photo embedding.
- No bulk avatar import.
- No DB schema change — `avatarUrl` and `gender` already exist on both Dispatcher and Employee.
- Renaming `DispatcherAvatar` to a more generic `SubjectAvatar` — keep the existing name to avoid touching unrelated call sites; the component is already generic via `apiBasePath`.
