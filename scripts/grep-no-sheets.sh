#!/usr/bin/env bash
# CI guard — fails if any Google-Sheets-related reference leaks back into
# the runtime code, schema, or config after the removal.
# Spec: context/features/sheets-removal-downloads-center-drawer-spec.md (P1-T9)
#
# Only scans paths that ship the product: src/, prisma/schema.prisma, scripts/,
# e2e/, and top-level config. Historical spec/docs under context/ and legacy
# /prisma/migrations/ are intentionally excluded — they are append-only
# records of what the codebase looked like at a point in time.

set -euo pipefail

PATTERN='googleapis|googleSheets|google sheets|Sync to Google|/export/sheets|GOOGLE_SHEETS_'

INCLUDE_PATHS=(
  src
  prisma/schema.prisma
  e2e
  scripts
  playwright.config.ts
  vitest.config.ts
  next.config.ts
  next.config.mjs
)

EXCLUDES=(
  ":!src/generated/**"
  ":!scripts/grep-no-sheets.sh"
  # Legacy migration that ADDED the columns — append-only, never edit
  ":!prisma/migrations/20260413_add_google_sheets_tokens/**"
)

# Build the path args, skipping any that don't exist (git grep errors otherwise).
pathspecs=()
for p in "${INCLUDE_PATHS[@]}"; do
  if [[ -e "$p" ]]; then
    pathspecs+=("$p")
  fi
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "grep-no-sheets.sh must be run inside a git worktree" >&2
  exit 2
fi

hits=$(git grep -iInE "${PATTERN}" -- "${pathspecs[@]}" "${EXCLUDES[@]}" || true)

if [[ -n "${hits}" ]]; then
  echo "FAIL: Google Sheets references still in product code:" >&2
  echo "${hits}" >&2
  exit 1
fi

echo "OK: no Google Sheets references found in product code."
