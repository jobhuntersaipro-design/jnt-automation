import { describe, expect, it } from "vitest";
import { closeStatus } from "./month";

describe("closeStatus", () => {
  const draft = { status: "DRAFT" as const, penaltiesChecked: true, flagged: 0, unconfirmed: 0 };
  it("is ready only when nothing would stop finalising", () => {
    expect(closeStatus(null)).toBe("none");
    expect(closeStatus(draft)).toBe("ready");
    expect(closeStatus({ ...draft, status: "FINAL" })).toBe("final");
    expect(closeStatus({ ...draft, penaltiesChecked: false })).toBe("draft");
    expect(closeStatus({ ...draft, flagged: 2 })).toBe("draft");
    expect(closeStatus({ ...draft, unconfirmed: 1 })).toBe("draft");
  });
});
