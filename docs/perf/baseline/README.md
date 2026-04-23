# Performance Baseline — 2026-04-23

Phase 0 of the web-performance-optimization spec. Captured on `feature/web-performance-optimization` off `main` at `b2aa048`, before any optimization work. Rerun after each phase and diff against this.

## How to reproduce

```bash
npm run build
npx tsx scripts/capture-bundle-baseline.ts   # writes bundle-summary.md
npm run perf                                   # Lighthouse CI → lighthouse/
npx next experimental-analyze -o               # writes .next/diagnostics/analyze/ (interactive)
npx next experimental-analyze                  # serves the UI at :4000
```

## Environment

- Next.js 16.2.1 (Turbopack build)
- React 19.2.4 (React Compiler enabled)
- Commit: `b2aa048` (tip of `main`)
- Build: production (`npm run build`)

## Bundle size — [bundle-summary.md](./bundle-summary.md)

| | Files | Raw | Gzipped |
|---|---:|---:|---:|
| JS | 31 | 2164.1 KB | **637.5 KB** |
| CSS | 2 | 121.8 KB | 20.4 KB |

The two largest chunks alone are ~106 KB gzipped each (likely Recharts + React/Next runtime). Spec targets ≤ 250 KB gzipped first-load for `/dashboard` and `/dispatchers` — we'll get there by lazy-loading drawers/dialogs/charts and memoizing table rows (Phase 1).

## Lighthouse — [lighthouse/](./lighthouse/)

Three runs against `http://localhost:3000/auth/login` (desktop preset, `--no-sandbox --disable-gpu`). Raw HTML + JSON reports in `lighthouse/`.

| Category | Score (3rd run) |
|---|---:|
| Performance | **100** |
| Accessibility | 90 |
| Best Practices | 100 |
| SEO | 100 |

Core Web Vitals on the login page are green out of the box (FCP 0.2s, LCP 0.5s, TBT 0 ms, CLS 0, SI 0.2s, TTI 0.5s). The **audit findings** are the real signal for Phase 1:

| Audit | Value |
|---|---|
| Total byte weight | 889 KiB |
| Reduce unused JavaScript | Est savings **346 KiB** |
| Minify JavaScript | Est savings 199 KiB |

i.e. the login page ships ~889 KiB of which roughly a third is dead code, just because the app's shared chunks are fat. That's exactly what Phase 1 dynamic-import + memoization work will trim.

### Caveat — authenticated routes aren't measured

Lighthouse follows redirects, so hitting `/dashboard`, `/dispatchers`, `/staff` without cookies just loads `/auth/login`. Real measurement of those routes needs cookie injection (Playwright storageState → Puppeteer via `settings.extraHeaders`), which is **deferred to a later sprint**. For now the aggregate bundle size in `bundle-summary.md` is our proxy for authenticated-route perf.

## Neon slow queries — PENDING

Attempted `mcp__neon__list_slow_queries` — failed with `pg_stat_statements extension is not installed`. Ran `CREATE EXTENSION IF NOT EXISTS pg_stat_statements` which returned empty (likely success), but the follow-up `list_slow_queries` was blocked by the MCP permission system as "production project modification". Not re-attempted.

**Action for human:** verify the extension is (or isn't) installed on the development branch, decide whether to allow it, and rerun `mcp__neon__list_slow_queries` with the correct `branchId`. Once available, save the output to `docs/perf/baseline/slow-queries.md`.

Context note: CLAUDE.md mentions the dev branch endpoint ID `ep-bold-unit-aml1ct5y` and prod `ep-red-cherry-am7dh9mw`, but these are **endpoint IDs, not branch IDs**. The Neon MCP needs a branch ID like `br-xxxx`; omitting it uses the project's default branch, which per CLAUDE.md is `development` — but the permission denial suggests the tool treated the call as production-scoped. To be resolved before Phase 2 (which adds indexes).

## What this baseline is for

Phase 1 (client bundle) exit criteria → rerun `npm run build && npx tsx scripts/capture-bundle-baseline.ts` and compare `bundle-summary.md`. Target ≥ 30% drop in total gzipped JS.

Phase 2/3 (DB + async jobs) → slow-query diff once it's available.

Phase 4 (assets) → Lighthouse re-run showing reduced byte weight + better audit scores.
