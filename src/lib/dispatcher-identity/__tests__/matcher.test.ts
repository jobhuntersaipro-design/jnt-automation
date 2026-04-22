import { describe, it, expect } from "vitest";
import {
  areSamePerson,
  clusterDispatchers,
  findMatchingPerson,
  firstToken,
  normalizeIc,
  type IdentityCandidate,
} from "../matcher";

// ─── Helpers ──────────────────────────────────────────────────

function rec(
  id: string,
  icNo: string | null,
  normalizedName: string,
): IdentityCandidate {
  return { id, icNo, normalizedName };
}

// ─── normalizeIc ──────────────────────────────────────────────

describe("normalizeIc", () => {
  it("strips dashes from a MyKad number", () => {
    expect(normalizeIc("123456-12-3456")).toBe("123456123456");
  });

  it("returns null for empty string", () => {
    expect(normalizeIc("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeIc("   ")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizeIc(null)).toBeNull();
  });

  it("returns null for a string with no digits", () => {
    expect(normalizeIc("---")).toBeNull();
  });

  it("already-normalized IC passes through", () => {
    expect(normalizeIc("123456123456")).toBe("123456123456");
  });

  it("returns null for an IC shorter than 12 digits", () => {
    expect(normalizeIc("12345")).toBeNull();
  });

  it("returns null for an IC longer than 12 digits", () => {
    expect(normalizeIc("1234567890123")).toBeNull();
  });

  it("returns null for the all-zeros placeholder", () => {
    // The pre-nullable schema forced a non-empty value; "000000000000" was the
    // common bogus fill. It must not act as an identity key or every such row
    // gets merged into one person.
    expect(normalizeIc("000000000000")).toBeNull();
  });

  it("returns null for all-same-digit placeholders", () => {
    expect(normalizeIc("111111111111")).toBeNull();
    expect(normalizeIc("999999999999")).toBeNull();
  });
});

// ─── firstToken ───────────────────────────────────────────────

describe("firstToken", () => {
  it("returns first space-delimited token", () => {
    expect(firstToken("AHMAD KAMARUL AFFIZA")).toBe("AHMAD");
  });

  it("returns the whole string when there is no space", () => {
    expect(firstToken("AHMAD")).toBe("AHMAD");
  });

  it("returns empty string for empty input", () => {
    expect(firstToken("")).toBe("");
  });

  it("is defensive against leading whitespace", () => {
    expect(firstToken("  AHMAD KAMARUL")).toBe("AHMAD");
  });
});

// ─── areSamePerson ────────────────────────────────────────────

describe("areSamePerson", () => {
  it("matches when both have the same IC", () => {
    const a = rec("a", "123456-12-3456", "AHMAD");
    const b = rec("b", "123456-12-3456", "AHMAD");
    expect(areSamePerson(a, b)).toBe(true);
  });

  it("matches when both have the same IC and same first name (later tokens may vary)", () => {
    // IC is authoritative once first-name agrees; typos/abbreviations after
    // the first token are tolerated.
    const a = rec("a", "123456-12-3456", "AHMAD KAMARUL");
    const b = rec("b", "123456-12-3456", "AHMAD K");
    expect(areSamePerson(a, b)).toBe(true);
  });

  it("does NOT match when IC is shared but first names differ (guards against data-entry errors)", () => {
    // Real case from dev data: two rows share an IC but belong to different
    // people (one has the wrong IC). Auto-merging would corrupt payroll.
    const a = rec("a", "123456-12-3456", "ABDUL HAFIZ BIN YAP AFENDI");
    const b = rec("b", "123456-12-3456", "ABD HAKAM BIN CHE KAMIL");
    expect(areSamePerson(a, b)).toBe(false);
  });

  it("does NOT match when IC is shared but either side has no name", () => {
    // Defensive: no first name to verify agreement against = can't trust the
    // IC alone. Safer to leave them separate.
    const a = rec("a", "123456-12-3456", "");
    const b = rec("b", "123456-12-3456", "AHMAD");
    expect(areSamePerson(a, b)).toBe(false);
  });

  it("does not match when both have IC but ICs differ", () => {
    // Different ICs = different people, even if names match.
    const a = rec("a", "950101-07-1234", "AHMAD");
    const b = rec("b", "880715-14-5678", "AHMAD");
    expect(areSamePerson(a, b)).toBe(false);
  });

  it("matches dash-formatted vs digit-only IC", () => {
    const a = rec("a", "123456-12-3456", "AHMAD");
    const b = rec("b", "123456123456", "AHMAD");
    expect(areSamePerson(a, b)).toBe(true);
  });

  it("falls back to name when either IC is missing", () => {
    const a = rec("a", null, "AHMAD KAMARUL");
    const b = rec("b", "123456-12-3456", "AHMAD KAMARUL");
    expect(areSamePerson(a, b)).toBe(true);
  });

  it("falls back to name when both ICs are missing", () => {
    const a = rec("a", null, "AHMAD KAMARUL");
    const b = rec("b", null, "AHMAD KAMARUL");
    expect(areSamePerson(a, b)).toBe(true);
  });

  it("does not match when names differ and either IC is missing", () => {
    const a = rec("a", null, "AHMAD");
    const b = rec("b", null, "ALI");
    expect(areSamePerson(a, b)).toBe(false);
  });

  it("treats empty-string IC as missing IC", () => {
    const a = rec("a", "", "AHMAD");
    const b = rec("b", null, "AHMAD");
    expect(areSamePerson(a, b)).toBe(true);
  });

  it("does not match when both names are empty (guards against phantom merges)", () => {
    const a = rec("a", null, "");
    const b = rec("b", null, "");
    expect(areSamePerson(a, b)).toBe(false);
  });
});

// ─── findMatchingPerson ───────────────────────────────────────

describe("findMatchingPerson", () => {
  const candidates: IdentityCandidate[] = [
    rec("p1", "950101-07-1234", "AHMAD KAMARUL"),
    rec("p2", null, "SITI IBRAHIM"),
    rec("p3", "920304-10-9876", "ALI HASSAN"),
  ];

  it("finds a candidate by IC", () => {
    const match = findMatchingPerson(
      { icNo: "950101-07-1234", normalizedName: "AHMAD K" },
      candidates,
    );
    expect(match?.id).toBe("p1");
  });

  it("falls back to name when input has no IC", () => {
    const match = findMatchingPerson(
      { icNo: null, normalizedName: "SITI IBRAHIM" },
      candidates,
    );
    expect(match?.id).toBe("p2");
  });

  it("returns null when neither IC nor name matches", () => {
    const match = findMatchingPerson(
      { icNo: "010203-04-5566", normalizedName: "NEW PERSON" },
      candidates,
    );
    expect(match).toBeNull();
  });

  it("prefers IC match over name match", () => {
    // If IC matches p1 but name matches p2, return p1 (IC is authoritative)
    const match = findMatchingPerson(
      { icNo: "950101-07-1234", normalizedName: "SITI IBRAHIM" },
      candidates,
    );
    expect(match?.id).toBe("p1");
  });

  it("matches by IC regardless of formatting differences (dashes vs digits)", () => {
    // Input is the digit-only form of p1's dash-formatted IC. Digit-stripping
    // on both sides normalizes them to the same value.
    const match = findMatchingPerson(
      { icNo: "950101071234", normalizedName: "DIFFERENT NAME" },
      candidates,
    );
    expect(match?.id).toBe("p1");
  });

  it("does not match on empty normalized name", () => {
    const match = findMatchingPerson(
      { icNo: null, normalizedName: "" },
      candidates,
    );
    expect(match).toBeNull();
  });
});

// ─── clusterDispatchers ───────────────────────────────────────

describe("clusterDispatchers", () => {
  it("returns one cluster per record when no matches exist", () => {
    const records = [
      rec("a", "950101-07-1234", "AHMAD"),
      rec("b", "880715-14-5678", "SITI"),
      rec("c", "920304-10-9876", "ALI"),
    ];
    const clusters = clusterDispatchers(records);
    expect(clusters).toHaveLength(3);
  });

  it("merges records sharing the same IC and first name into one cluster", () => {
    const records = [
      rec("a", "950101-07-1234", "AHMAD KAMARUL"),
      rec("b", "950101-07-1234", "AHMAD K"),
      rec("c", "950101-07-1234", "AHMAD BIN RASHID"),
    ];
    const clusters = clusterDispatchers(records);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("splits an IC bucket when first names disagree (real-world ABD HAKAM case)", () => {
    const records = [
      rec("a", "950101-07-1234", "ABDUL HAFIZ BIN YAP AFENDI"),
      rec("b", "950101-07-1234", "ABD HAKAM BIN CHE KAMIL"),
    ];
    const clusters = clusterDispatchers(records);
    expect(clusters).toHaveLength(2);
  });

  it("merges records sharing the same normalized name when IC absent", () => {
    const records = [
      rec("a", null, "AHMAD KAMARUL"),
      rec("b", null, "AHMAD KAMARUL"),
    ];
    const clusters = clusterDispatchers(records);
    expect(clusters).toHaveLength(1);
  });

  it("merges transitively via mixed IC and name edges", () => {
    // a ↔ b by IC + same first name. b ↔ c by name fallback (c has no IC,
    // same exact name as b). a ↔ c would NOT match directly — different
    // normalized names — but transitivity through b pulls all three together.
    const records = [
      rec("a", "950101-07-1234", "AHMAD KAMARUL"),
      rec("b", "950101-07-1234", "AHMAD A"),
      rec("c", null, "AHMAD A"),
    ];
    const clusters = clusterDispatchers(records);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  it("does not merge when ICs differ even with same name", () => {
    const records = [
      rec("a", "950101-07-1234", "AHMAD"),
      rec("b", "880715-14-5678", "AHMAD"),
    ];
    const clusters = clusterDispatchers(records);
    expect(clusters).toHaveLength(2);
  });

  it("keeps records with empty names separate (no phantom merges)", () => {
    const records = [
      rec("a", null, ""),
      rec("b", null, ""),
    ];
    const clusters = clusterDispatchers(records);
    expect(clusters).toHaveLength(2);
  });
});
