import { describe, it, expect } from "vitest";
import {
  computeProgressFraction,
  computeProgressPercent,
  STAGE_WEIGHTS,
} from "../bulk-progress";

describe("bulk-progress weights", () => {
  it("stage weights sum to 1", () => {
    const sum =
      STAGE_WEIGHTS.fetching +
      STAGE_WEIGHTS.generating +
      STAGE_WEIGHTS.zipping +
      STAGE_WEIGHTS.uploading;
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("computeProgressFraction", () => {
  const base = { done: 0, total: 10 };

  it("returns 0 at queued", () => {
    expect(
      computeProgressFraction({ ...base, stage: "queued", status: "queued" }),
    ).toBe(0);
  });

  it("returns 0 at the start of fetching", () => {
    expect(
      computeProgressFraction({ ...base, stage: "fetching", status: "running" }),
    ).toBe(0);
  });

  it("scales smoothly through generating", () => {
    const start = computeProgressFraction({
      stage: "generating",
      status: "running",
      done: 0,
      total: 10,
    });
    const half = computeProgressFraction({
      stage: "generating",
      status: "running",
      done: 5,
      total: 10,
    });
    const full = computeProgressFraction({
      stage: "generating",
      status: "running",
      done: 10,
      total: 10,
    });
    expect(start).toBeCloseTo(0.05, 10);
    expect(half).toBeCloseTo(0.05 + 0.5 * 0.7, 10); // 0.40
    expect(full).toBeCloseTo(0.05 + 0.7, 10); // 0.75
  });

  it("jumps to 0.75 when zipping begins, regardless of done count", () => {
    expect(
      computeProgressFraction({
        stage: "zipping",
        status: "running",
        done: 10,
        total: 10,
      }),
    ).toBeCloseTo(0.75, 10);
  });

  it("jumps to 0.9 when uploading begins", () => {
    expect(
      computeProgressFraction({
        stage: "uploading",
        status: "running",
        done: 10,
        total: 10,
      }),
    ).toBeCloseTo(0.9, 10);
  });

  it("returns 1 for done and failed jobs", () => {
    expect(
      computeProgressFraction({
        stage: "done",
        status: "done",
        done: 10,
        total: 10,
      }),
    ).toBe(1);
    expect(
      computeProgressFraction({
        stage: "generating",
        status: "failed",
        done: 3,
        total: 10,
      }),
    ).toBe(1);
  });

  it("handles zero-total generating gracefully", () => {
    expect(
      computeProgressFraction({
        stage: "generating",
        status: "running",
        done: 0,
        total: 0,
      }),
    ).toBeCloseTo(0.05, 10);
  });

  it("clamps done > total to total", () => {
    const over = computeProgressFraction({
      stage: "generating",
      status: "running",
      done: 20,
      total: 10,
    });
    expect(over).toBeCloseTo(0.75, 10);
  });
});

describe("computeProgressPercent", () => {
  it("rounds to the nearest integer", () => {
    expect(
      computeProgressPercent({
        stage: "generating",
        status: "running",
        done: 3,
        total: 10,
      }),
    ).toBe(Math.round((0.05 + 0.3 * 0.7) * 100));
  });

  it("returns 100 for done jobs", () => {
    expect(
      computeProgressPercent({
        stage: "done",
        status: "done",
        done: 10,
        total: 10,
      }),
    ).toBe(100);
  });
});
