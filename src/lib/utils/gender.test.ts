import { describe, it, expect } from "vitest";
import { deriveGender } from "./gender";

describe("deriveGender", () => {
  it("returns MALE for IC ending in odd digit", () => {
    expect(deriveGender("990101145671")).toBe("MALE");
    expect(deriveGender("990101145673")).toBe("MALE");
    expect(deriveGender("990101145675")).toBe("MALE");
    expect(deriveGender("990101145677")).toBe("MALE");
    expect(deriveGender("990101145679")).toBe("MALE");
  });

  it("returns FEMALE for IC ending in even digit", () => {
    expect(deriveGender("990101145670")).toBe("FEMALE");
    expect(deriveGender("990101145672")).toBe("FEMALE");
    expect(deriveGender("990101145674")).toBe("FEMALE");
    expect(deriveGender("990101145676")).toBe("FEMALE");
    expect(deriveGender("990101145678")).toBe("FEMALE");
  });

  it("returns UNKNOWN for non-numeric last character", () => {
    expect(deriveGender("99010114567X")).toBe("UNKNOWN");
    expect(deriveGender("")).toBe("UNKNOWN");
  });
});
