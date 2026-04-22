export interface IdentityCandidate {
  id: string;
  icNo: string | null;
  normalizedName: string;
}

export interface IdentityInput {
  icNo: string | null;
  normalizedName: string;
}

// A valid Malaysian MyKad is exactly 12 digits. Anything else is treated as
// missing (null) for matching purposes — including placeholder patterns like
// "000000000000" that existed in the data before icNo became nullable.
export function normalizeIc(ic: string | null | undefined): string | null {
  if (!ic) return null;
  const digits = ic.replace(/\D/g, "");
  if (digits.length !== 12) return null;
  if (/^(\d)\1{11}$/.test(digits)) return null; // all-same-digit placeholder
  return digits;
}

export function firstToken(normalizedName: string): string {
  const trimmed = normalizedName.trim();
  if (!trimmed) return "";
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

export function areSamePerson(
  a: IdentityCandidate | IdentityInput,
  b: IdentityCandidate | IdentityInput,
): boolean {
  const aIc = normalizeIc(a.icNo);
  const bIc = normalizeIc(b.icNo);

  if (aIc && bIc) {
    if (aIc !== bIc) return false;
    // IC matches — still require first-name agreement as a guard against
    // data-entry errors where two records share an IC but belong to different
    // people. Typos later in the name (e.g. "AHMAD K" vs "AHMAD KAMARUL") are
    // still accepted. If either side has no name, be conservative and reject.
    const aFirst = firstToken(a.normalizedName);
    const bFirst = firstToken(b.normalizedName);
    if (!aFirst || !bFirst) return false;
    return aFirst === bFirst;
  }

  if (!a.normalizedName || !b.normalizedName) return false;
  return a.normalizedName === b.normalizedName;
}

export function findMatchingPerson<C extends IdentityCandidate>(
  input: IdentityInput,
  candidates: readonly C[],
): C | null {
  const inputIc = normalizeIc(input.icNo);

  if (inputIc) {
    const icMatch = candidates.find((c) => normalizeIc(c.icNo) === inputIc);
    if (icMatch) return icMatch;
  }

  if (!input.normalizedName) return null;

  const nameMatch = candidates.find(
    (c) => normalizeIc(c.icNo) === null && c.normalizedName === input.normalizedName,
  );
  if (nameMatch) return nameMatch;

  // Candidate has an IC but input doesn't — still a name-fallback match.
  return (
    candidates.find(
      (c) => normalizeIc(c.icNo) !== null && c.normalizedName === input.normalizedName && !inputIc,
    ) ?? null
  );
}

export function clusterDispatchers<C extends IdentityCandidate>(
  records: readonly C[],
): C[][] {
  const n = records.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }

  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  // Index records for efficient pairing: group by normalized IC (if any)
  // and by normalized name. Records in the same bucket are pairwise checked.
  const icBuckets = new Map<string, number[]>();
  const nameBuckets = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const ic = normalizeIc(records[i].icNo);
    if (ic) {
      const arr = icBuckets.get(ic) ?? [];
      arr.push(i);
      icBuckets.set(ic, arr);
    }
    const name = records[i].normalizedName;
    if (name) {
      const arr = nameBuckets.get(name) ?? [];
      arr.push(i);
      nameBuckets.set(name, arr);
    }
  }

  for (const group of icBuckets.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (areSamePerson(records[group[i]], records[group[j]])) {
          union(group[i], group[j]);
        }
      }
    }
  }

  for (const group of nameBuckets.values()) {
    // Name fallback: only applies when at least one side has no IC.
    // If every record in the name bucket has an IC and they differ, they are
    // different people sharing a name.
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (areSamePerson(records[group[i]], records[group[j]])) {
          union(group[i], group[j]);
        }
      }
    }
  }

  const componentOf = new Map<number, C[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = componentOf.get(root) ?? [];
    arr.push(records[i]);
    componentOf.set(root, arr);
  }
  return Array.from(componentOf.values());
}
