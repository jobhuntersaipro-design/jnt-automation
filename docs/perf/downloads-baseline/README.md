# Download performance baselines

Markdown snapshots produced by [`scripts/bench-downloads.ts`](../../../scripts/bench-downloads.ts).
One file per run, dated `YYYY-MM-DD.md`.

## Run

```sh
# Make sure DATABASE_URL points at the Neon development branch (CLAUDE.md
# forbids pointing a bench at prod).
npx tsx scripts/bench-downloads.ts
```

The script:
1. Seeds a dedicated `bench-agent@easystaff.top` agent with 50 dispatchers ×
   200 parcels each = 10 k line items (tunable via env).
2. Invokes each download-generation code path directly (no HTTP round-trip).
3. Writes a timestamped Markdown table here.

## Tear down

```sh
npx tsx scripts/bench-downloads.ts --cleanup
```

Deletes the seeded agent + cascading child rows.

## What's measured

- **bulk month-detail CSV** — `generateMonthDetailFiles` + `streamZipToR2`,
  full flow for 50 dispatchers × CSV per dispatcher.
- **bulk month-detail PDF** — same, PDF format. CPU-bound; the one to watch.
- **inline payslips ZIP** — `generatePayslipPdf` × 50 (parallelized via
  `runPool` concurrency 4) + `generatePayslipZip`.

Reported columns:
- **Total (ms)** — wall-clock from first byte of DB fetch to last byte
  uploaded to R2.
- **Peak RSS (MB)** — max resident memory sampled during the run.
- **Output (KB)** — uncompressed file sum for ZIPs (streamed archives don't
  cheaply surface compressed size).

## Tunables (env)

| Variable | Default | Description |
|---|---:|---|
| `BENCH_DISPATCHERS` | 50 | Dispatcher count in the fixture |
| `BENCH_PARCELS` | 200 | Parcels per dispatcher per month |
| `BENCH_OUTPUT_DIR` | `docs/perf/downloads-baseline` | Where the report goes |

## Interpreting deltas

Expected wins from each phase:

| Phase | Path | Expected delta |
|---|---|---|
| 1 | inline payslips ZIP | ~4× (was serial, now concurrency 4) |
| 3a | bulk month-detail (both) | flat RAM during zipping; total time similar (RAM is the win) |
| 3b | bulk month-detail (prod only) | ~N× where N = `ceil(dispatchers / 15)`. **Not captured by this bench** — benchmark invokes generation directly, skipping QStash. Measure via a real prod job end-to-end. |

## Not measured here

- **HTTP + middleware overhead** — ~100–300 ms, network-dependent.
- **Download-path streaming** (`GET /bulk/[jobId]/download`) — trivial (~1 R2
  round-trip). Easy to smoke via curl after a job completes.
- **QStash fan-out** (Phase 3b prod path) — only runs with `QSTASH_TOKEN`
  set and a reachable `NEXT_PUBLIC_APP_URL`. Dev runs inline, so the bench
  doesn't exercise it.
