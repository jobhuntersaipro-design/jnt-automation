import { normalizeName } from "@/lib/dispatcher-identity/normalize-name";

// Links a penalty row to a dispatcher: a decision someone made before (alias), then the J&T
// ID, then a name that only one dispatcher has (at the row's branch, when the file names one).
// Anything else waits in the unmatched queue.

export interface Person {
  id: string;
  name: string;
  /** Each J&T ID the person has, with the outlet it's at. */
  ids: { extId: string; outlet: string }[];
}

export interface Directory {
  byExtId: Map<string, { dispatcherId: string; outlet: string }[]>;
  byName: Map<string, { dispatcherId: string; outlets: string[] }[]>;
  /** "id:<J&T ID>" or "name:<normalized name>" → a dispatcher, or null to ignore. */
  aliases: Map<string, string | null>;
}

export type Match = { status: "MATCHED"; dispatcherId: string } | { status: "UNMATCHED" | "IGNORED"; dispatcherId: null };

export interface Identity {
  extId: string | null;
  name: string | null;
  outlet: string | null;
}

export function buildDirectory(people: Person[], aliases: { key: string; dispatcherId: string | null }[]): Directory {
  const byExtId = new Map<string, { dispatcherId: string; outlet: string }[]>();
  const byName = new Map<string, { dispatcherId: string; outlets: string[] }[]>();
  for (const p of people) {
    for (const { extId, outlet } of p.ids) byExtId.set(extId.toUpperCase(), [...(byExtId.get(extId.toUpperCase()) ?? []), { dispatcherId: p.id, outlet }]);
    const name = normalizeName(p.name);
    byName.set(name, [...(byName.get(name) ?? []), { dispatcherId: p.id, outlets: p.ids.map((i) => i.outlet) }]);
  }
  return { byExtId, byName, aliases: new Map(aliases.map((a) => [a.key, a.dispatcherId])) };
}

/** The keys a decision about this row is remembered under: its J&T ID, else its name. */
export function aliasKey(r: Identity): string | null {
  if (r.extId) return `id:${r.extId.toUpperCase()}`;
  return r.name ? `name:${normalizeName(r.name)}` : null;
}

const unique = (ids: string[]) => (new Set(ids).size === 1 ? ids[0] : null);

export function matchPenalty(r: Identity, dir: Directory): Match {
  for (const key of [aliasKey(r), r.name ? `name:${normalizeName(r.name)}` : null]) {
    if (!key || !dir.aliases.has(key)) continue;
    const id = dir.aliases.get(key);
    return id ? { status: "MATCHED", dispatcherId: id } : { status: "IGNORED", dispatcherId: null };
  }
  if (r.extId) {
    const all = dir.byExtId.get(r.extId.toUpperCase()) ?? [];
    const here = all.filter((c) => c.outlet === r.outlet);
    const id = unique((here.length > 0 ? here : all).map((c) => c.dispatcherId));
    if (id) return { status: "MATCHED", dispatcherId: id };
  }
  // A row that names a branch only matches people there: the same name at another branch is someone else.
  const named = r.name ? (dir.byName.get(normalizeName(r.name)) ?? []) : [];
  const id = unique(named.filter((c) => !r.outlet || c.outlets.includes(r.outlet)).map((c) => c.dispatcherId));
  return id ? { status: "MATCHED", dispatcherId: id } : { status: "UNMATCHED", dispatcherId: null };
}
