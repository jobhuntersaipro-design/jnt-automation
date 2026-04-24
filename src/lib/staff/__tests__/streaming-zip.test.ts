/**
 * Guard: streamZipToR2 must refuse to write an empty archive. The 2026-03
 * incident ran all 100 dispatchers through the PDF renderer, caught every
 * error, filtered the nulls out, and handed `[]` to streamZipToR2, which
 * happily emitted a 22-byte EOCD-only zip to the canonical cache key —
 * macOS/7-zip then reported "file empty or non-readable" on every subsequent
 * download until the blob was manually invalidated.
 *
 * Throwing here turns that silent cache-poison into a visible failed job.
 */
import { describe, expect, it, vi } from "vitest";

// Mock R2 so the test doesn't need network access — we're only exercising
// the early-exit guard, which runs before any AWS SDK call.
vi.mock("@/lib/r2", () => ({
  r2: {},
  R2_BUCKET: "test-bucket",
}));

import { streamZipToR2 } from "../streaming-zip";

describe("streamZipToR2 — empty input guard", () => {
  it("throws when files array is empty, includes the key in the error for debugging", async () => {
    await expect(
      streamZipToR2("payroll-cache/agent-1/2026-03/details.pdf.zip", []),
    ).rejects.toThrow(/payroll-cache\/agent-1\/2026-03\/details\.pdf\.zip/);
  });
});
