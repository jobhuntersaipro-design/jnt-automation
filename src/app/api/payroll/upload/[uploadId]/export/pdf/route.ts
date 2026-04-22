import { NextResponse } from "next/server";

/**
 * Stub — see context/features/sheets-removal-downloads-center-drawer-spec.md
 * Returns a single PDF of per-dispatcher totals for the given upload.
 * Wired in Phase 2 of the feature.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet" },
    { status: 501 },
  );
}
