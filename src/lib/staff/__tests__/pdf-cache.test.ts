/**
 * Tests for the canonical PDF/CSV/ZIP cache key builders + helpers.
 * Spec: context/features/pdf-cache-spec.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  r2: { send: mockSend },
  R2_BUCKET: "test-bucket",
}));

import {
  cacheKeysForRecords,
  csvKey,
  deleteCachedBlobs,
  hasCached,
  pdfKey,
  zipKey,
} from "../pdf-cache";

beforeEach(() => {
  mockSend.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("key builders", () => {
  it("pdfKey — zero-pads month, uses record id leaf", () => {
    expect(pdfKey("agentA", 2026, 3, "rec_123")).toBe(
      "payroll-cache/agentA/2026-03/rec_123.pdf",
    );
    expect(pdfKey("agentA", 2026, 12, "rec_456")).toBe(
      "payroll-cache/agentA/2026-12/rec_456.pdf",
    );
  });

  it("csvKey — same layout as pdfKey but .csv extension", () => {
    expect(csvKey("agentA", 2025, 7, "rec_9")).toBe(
      "payroll-cache/agentA/2025-07/rec_9.csv",
    );
  });

  it("zipKey — details.{pdf|csv}.zip leaf", () => {
    expect(zipKey("agentA", 2026, 3, "pdf")).toBe(
      "payroll-cache/agentA/2026-03/details.pdf.zip",
    );
    expect(zipKey("agentA", 2026, 3, "csv")).toBe(
      "payroll-cache/agentA/2026-03/details.csv.zip",
    );
  });

  it("cacheKeysForRecords — produces per-record pair + both zip keys", () => {
    const keys = cacheKeysForRecords("agentA", 2026, 3, ["r1", "r2"]);
    expect(keys).toEqual([
      "payroll-cache/agentA/2026-03/r1.pdf",
      "payroll-cache/agentA/2026-03/r1.csv",
      "payroll-cache/agentA/2026-03/r2.pdf",
      "payroll-cache/agentA/2026-03/r2.csv",
      "payroll-cache/agentA/2026-03/details.pdf.zip",
      "payroll-cache/agentA/2026-03/details.csv.zip",
    ]);
  });

  it("cacheKeysForRecords — with no record ids, still emits the zip keys", () => {
    const keys = cacheKeysForRecords("agentA", 2026, 3, []);
    expect(keys).toEqual([
      "payroll-cache/agentA/2026-03/details.pdf.zip",
      "payroll-cache/agentA/2026-03/details.csv.zip",
    ]);
  });
});

describe("hasCached — HEAD semantics", () => {
  it("returns true on a successful HEAD", async () => {
    mockSend.mockResolvedValueOnce({});
    await expect(hasCached("k")).resolves.toBe(true);
  });

  it("returns false on NotFound name", async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error("gone"), { name: "NotFound" }));
    await expect(hasCached("k")).resolves.toBe(false);
  });

  it("returns false on NoSuchKey name", async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error("gone"), { name: "NoSuchKey" }));
    await expect(hasCached("k")).resolves.toBe(false);
  });

  it("returns false on 404 status code (no name)", async () => {
    const err = new Error("404");
    (err as unknown as { $metadata: { httpStatusCode: number } }).$metadata = {
      httpStatusCode: 404,
    };
    mockSend.mockRejectedValueOnce(err);
    await expect(hasCached("k")).resolves.toBe(false);
  });

  it("rethrows on non-404 errors", async () => {
    mockSend.mockRejectedValueOnce(new Error("boom 500"));
    await expect(hasCached("k")).rejects.toThrow("boom 500");
  });
});

describe("deleteCachedBlobs — batches", () => {
  it("no-ops when passed an empty array", async () => {
    await deleteCachedBlobs([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("issues one DeleteObjects call for <= 1000 keys", async () => {
    mockSend.mockResolvedValue({});
    await deleteCachedBlobs(["a", "b", "c"]);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("chunks into 1000-key batches", async () => {
    mockSend.mockResolvedValue({});
    const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
    await deleteCachedBlobs(keys);
    expect(mockSend).toHaveBeenCalledTimes(3); // 1000 + 1000 + 500
  });
});
