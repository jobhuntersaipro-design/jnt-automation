# Coding Standards

## TypeScript

- Strict mode enabled
- No `any` types — use proper typing or `unknown`
- Define interfaces for all props, API responses, and data models
- Use type inference where obvious, explicit types where helpful

## React

- Functional components only (no class components)
- Use hooks for state and side effects
- Keep components focused — one job per component
- Extract reusable logic into custom hooks

## Next.js

- Server components by default
- Only use `'use client'` when needed (interactivity, hooks, browser APIs)
- Use Server Actions for form submissions and simple mutations
- Use API routes for:
  - File uploads (Excel payroll files, dispatcher avatars)
  - Export endpoints (Google Sheets, PDF invoice generation)
  - Long-running operations (salary calculation after upload)
  - Webhooks if needed in future
- Otherwise, fetch data directly in server components
- Dynamic routes for dispatcher detail pages (`/staff/[dispatcherId]`)

## Tailwind CSS v4

**CRITICAL**: This project uses Tailwind CSS v4, which uses CSS-based configuration.

- **DO NOT** create `tailwind.config.ts` or `tailwind.config.js` (those are v3)
- All theme configuration goes in `src/app/globals.css` using the `@theme` directive
- Use CSS custom properties for colors, spacing, etc.
- No JavaScript-based config

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(50% 0.2 250);
}
```

- Dark mode first, light mode as option
- No inline styles
- Use ShadCN UI components where applicable

## File Organization

```
src/
├── actions/[feature].ts        # Server Actions
├── app/[route]/page.tsx        # Pages
├── components/[feature]/       # Feature components
│   └── ComponentName.tsx
├── lib/
│   ├── prisma.ts               # Prisma client singleton
│   ├── r2.ts                   # Cloudflare R2 client
│   ├── salary-calculator.ts    # Core salary logic
│   ├── excel-parser.ts         # Parse uploaded .xlsx
│   └── ic-utils.ts             # MyKad IC parsing (gender detection)
└── types/[feature].ts          # TypeScript types
```

## Naming

- Components: PascalCase (`DispatcherCard.tsx`)
- Files: Match component name or kebab-case
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase (no `I` prefix)

## Database

- Use Prisma ORM for all database operations
- **Never use `prisma db push`** — always use migrations
  - Local: `prisma migrate dev`
  - Production: `prisma migrate deploy` (must run before app starts)
  - Check status: `prisma migrate status` before committing
- **Always scope queries by `agentId`** — every Branch, Dispatcher, Upload, and SalaryRecord query must include the authenticated agent's ID to enforce tenant isolation
- Avoid N+1 queries — use `include` or `select` to load relations in one query

```ts
// ✅ Correct — scoped and joined in one query
const dispatchers = await prisma.dispatcher.findMany({
  where: { branch: { agentId: session.agentId } },
  include: { weightTiers: true, incentiveRule: true, petrolRule: true }
})

// ❌ Wrong — missing agentId scope
const dispatchers = await prisma.dispatcher.findMany()
```

## Salary Calculation

Core logic lives in `src/lib/salary-calculator.ts`. Rules:

```
Net Salary = Base Salary (flat rate per parcel per weight tier)
           + Monthly Incentive (if total orders ≥ threshold)
           + Petrol Subsidy (per qualifying day ≥ daily threshold, if eligible)
           - Penalty (manual, optional)
           - Advance (manual, optional)
```

- Weight tier commission is **flat rate per parcel**, not per-kg
- Petrol subsidy is applied **once per qualifying day**, not per order
- Gender is derived from IC number — last digit odd = male, even = female — never stored as a manual input

## Data Fetching

- Server components fetch directly with Prisma
- Client components use Server Actions
- Validate all inputs with Zod

## Error Handling

- Use try/catch in Server Actions
- Return `{ success, data, error }` pattern from all actions
- Display user-friendly error messages via toast notifications
- Never expose raw Prisma errors to the client

## Testing

- Vitest for unit tests (server actions and utilities only, not components)
- Test files live next to source: `feature.test.ts`
- Run tests: `npm run test` (single run) or `npm run test:watch` (watch mode)
- Use `vi.mock()` for external dependencies (Prisma, R2, Google Sheets API, etc.)
- Use `vi.useFakeTimers()` for time-dependent logic
- **Salary calculation logic must have unit tests** — cover edge cases like zero orders, missing tiers, partial months

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible
- No `any` types — ever
