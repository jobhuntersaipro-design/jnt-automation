import { NextResponse } from "next/server";

/**
 * Stub — see context/features/sheets-removal-downloads-center-drawer-spec.md
 * Returns a single PDF of the dispatcher's YTD salary history.
 * Wired in Phase 2 of the feature.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet" },
    { status: 501 },
  );
}
