# R2 Lifecycle Rule — `bulk-exports/`

Paired with `TTL_SECONDS = 60 * 60 * 24 * 30` (30 days) in
[src/lib/staff/bulk-job.ts](../../src/lib/staff/bulk-job.ts). Ensures the R2
blob and its Redis pointer age out together, so users never see
"export ready but download fails" or "blob lingers forever while Redis
already forgot about it."

## Apply in Cloudflare dashboard

1. Open **R2 → Bucket (the one backing `R2_BUCKET`) → Settings → Object
   lifecycle**.
2. **Add rule**:
   - Name: `bulk-exports 30-day expiry`
   - Scope: `Prefix` = `bulk-exports/`
   - Action: **Delete objects** — `After 30 days`
3. Save.

## Or apply via Wrangler / API

```sh
npx wrangler r2 bucket lifecycle add <BUCKET_NAME> \
  --name "bulk-exports 30-day expiry" \
  --prefix "bulk-exports/" \
  --expire-after 30d
```

## Verify

```sh
npx wrangler r2 bucket lifecycle list <BUCKET_NAME>
```

Should show the `bulk-exports/` rule with `expireAfterDays: 30`.

## Why 30 days

- Matches the Redis TTL on `bulk-job:*` entries. Any re-download within that
  window hits both the pointer and the blob.
- Long enough to cover a monthly payroll cycle: a user generating exports
  at month-end can still re-pull them right up to the next month-end.
- Short enough that storage cost stays flat at the observed ~1 export/day/agent
  cadence (30 objects × ~5–25 MB each = < 1 GB/agent steady state).

## Not covered by this rule

- `avatars/*` and `uploads/*` prefixes — intentionally persistent, no
  lifecycle rule wanted.
- In-progress job blobs written under `bulk-exports/<agentId>/<jobId>/parts/`
  by the QStash fan-out worker (Phase 3b). Those are deleted explicitly by the
  `/finalize` handler once merged, but the 30-day rule is a safety net for
  abandoned runs.
