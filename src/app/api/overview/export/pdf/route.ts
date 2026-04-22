import { NextResponse } from "next/server";

/**
 * Stub — see context/features/sheets-removal-downloads-center-drawer-spec.md
 * Returns a single PDF of dispatcher performance + branch summary, honouring
 * the same from/to/branches filters as /export/csv.
 * Wired in Phase 2 of the feature.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet" },
    { status: 501 },
  );
}
