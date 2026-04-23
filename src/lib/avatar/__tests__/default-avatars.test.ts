import { describe, it, expect } from "vitest";
import {
  DEFAULT_AVATARS,
  getDefaultAvatarById,
  isDefaultAvatarUrl,
  DEFAULT_AVATAR_URL_PREFIX,
} from "../default-avatars";

describe("DEFAULT_AVATARS", () => {
  it("contains exactly 12 avatars", () => {
    expect(DEFAULT_AVATARS).toHaveLength(12);
  });

  it("every avatar has a unique id", () => {
    const ids = DEFAULT_AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every avatar points to a static /avatars/defaults/<id>.svg", () => {
    for (const avatar of DEFAULT_AVATARS) {
      expect(avatar.url).toBe(`${DEFAULT_AVATAR_URL_PREFIX}${avatar.id}.svg`);
    }
  });
});

describe("getDefaultAvatarById", () => {
  it("returns the avatar for a known id", () => {
    const known = DEFAULT_AVATARS[0];
    expect(getDefaultAvatarById(known.id)).toEqual(known);
  });

  it("returns undefined for unknown id", () => {
    expect(getDefaultAvatarById("not-a-real-id")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getDefaultAvatarById("")).toBeUndefined();
  });
});

describe("isDefaultAvatarUrl", () => {
  it("returns true for any registered default avatar URL", () => {
    for (const avatar of DEFAULT_AVATARS) {
      expect(isDefaultAvatarUrl(avatar.url)).toBe(true);
    }
  });

  it("returns false for an R2-hosted custom avatar URL", () => {
    expect(
      isDefaultAvatarUrl("https://r2.example.com/avatars/agent-xyz/disp-abc.jpg"),
    ).toBe(false);
  });

  it("returns false for a URL that matches the prefix but isn't in the set", () => {
    expect(
      isDefaultAvatarUrl(`${DEFAULT_AVATAR_URL_PREFIX}rogue-file.svg`),
    ).toBe(false);
  });

  it("returns false for null", () => {
    expect(isDefaultAvatarUrl(null)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDefaultAvatarUrl("")).toBe(false);
  });
});
