# EasyStaff

Payroll for J&T Express dispatcher agents: upload the monthly J&T delivery Excel, get net salaries per dispatcher, plus staff payroll, payslips and billing.

## v1 / v2

Each account picks one app via `Agent.uiVersion` (set by the superadmin in Admin → Manage):

- **v1**: `src/app/(dashboard)` and the existing `/api/*` routes. Frozen: no feature or calculation changes, critical bug fixes only.
- **v2**: `src/app/app` (`/app/*`), the config-driven payroll. Every v2 page and API route gates on `getV2Agent()` (`src/lib/ui-version.ts`); API routes return 403 when it is null.

Rules:

- Never change v1 code paths for v2 work. Shared code (auth, admin, Prisma client) changes additively only.
- Migrations are additive only: new tables and nullable or defaulted columns. No renames, drops or type changes on tables v1 uses.
- Every v2 query is scoped by `agentId`.
- Branch supervisors (team members, `Agent.ownerId`) work in their owner's account: `v2Session().member` is set. Owner-only actions and pages use `v2Owner()`; everything else narrows to the member's branches (`branchIn`, `dispatcherScope`, `penaltyScope` in `src/lib/v2/session.ts`).
- Never commit client files (payroll sheets, penalty files, rate cards) or client pricing; use synthetic fixtures.

v2 UI:

- Built on Arc UI free components, copied into `src/components/arc`. Add more with `node scripts/arc-add.mjs <item>`, never `npx shadcn add` (it rewrites Arc's Radix code for Base UI). Local edits to Arc files are listed at the top of that script.
- Style with CSS Modules reading the tokens in `src/components/v2/tokens.css`. No Tailwind and no raw colours in v2; v1's Tailwind scan skips the v2 folders so v2 can't change v1 CSS.
- Every v2 string goes through `t()` (`src/lib/i18n`, `en.ts` + `zh.ts`; `useI18n()` in client components, `getI18n()` on the server). ESLint rejects JSX text in v2 folders, and a test fails if `zh.ts` misses a key.

## Context Files

Read the following to get the full context of the project:

- @context/project-overview.md
- @context/coding-standards.md
- @context/ai-interaction.md
- @context/current-feature.md

## Commands

- **Dev server**: `npm run dev` (runs on http://localhost:3000)
- **Build**: `npm run build`
- **Production server**: `npm run start`
- **Lint**: `npm run lint`
- **Test**: `npm run test` (single run)
- **Test watch**: `npm run test:watch`

## Neon Database

When using the Neon MCP tools:

- **Project:** `easystaff`
- **Default Branch:** `development` (ID: `ep-bold-unit-aml1ct5y`)
- **Database:** `neondb`

**IMPORTANT:** Always use the development branch for all database operations. Never run queries against the production branch (`ep-red-cherry-am7dh9mw`) unless explicitly instructed to do so.

**IMPORTANT:** Do not add Claude to any commit messages
