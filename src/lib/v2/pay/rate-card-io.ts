import { escapeCsv } from "@/lib/csv";
import type { MessageKey } from "@/lib/i18n/en";
import { boundRanges, configProblems, decimals, ruleConfigSchema, type RuleConfig } from "./config";

// Rate cards in and out of spreadsheets: one row per (parcel tier, weight band), columns for
// the tier range, the weight range and one rate per vehicle (or a single rate). Pure, so the
// import preview reruns in the browser on every column change.

/** Under Next's 1 MB server action limit, with room for the form encoding. */
export const MAX_FILE_BYTES = 1_000_000;

export const FIELDS = ["tierFrom", "tierTo", "weightFrom", "weightTo", "bike", "car", "lorry", "rate"] as const;
export type Field = (typeof FIELDS)[number];
/** Column index per field; -1 = not in the file. */
export type Mapping = Record<Field, number>;

export interface ImportIssue {
  /** Sheet row number, or null for the whole file. */
  row: number | null;
  key: MessageKey;
  vars?: Record<string, string | number>;
}

// ─── Text → cells ────────────────────────────────────────────

/** RFC 4180 CSV. Keeps blank lines so index + 1 is the row number. Detects ",", ";" or tab; drops a BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0];
  const delimiter = [";", "\t"].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      rows.push([...row, cell]);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows;
}

/** CSV for Excel: BOM first so Chinese headers open as UTF-8. */
export const toCsv = (rows: string[][]) => "﻿" + rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n");

/**
 * "RM 1,234.50", " 1.2 kg " → number; blank, negative or junk → NaN. A comma only counts as a
 * thousands separator ("1,234"): "1,20" is NaN, never 120.
 */
export function parseNumber(text: string): number {
  const cleaned = text.replace(/rm|kg|公斤|件|pcs|parcels?/gi, "").replace(/\s/g, "");
  if (cleaned === "" || cleaned === "." || !/^(\d{1,3}(,\d{3})+|\d*)(\.\d*)?$/.test(cleaned)) return NaN;
  return Number(cleaned.replace(/,/g, ""));
}

const ABOVE_END = /\s*(\+|及以上|以上|and above|& above|or more|and over)\s*$/i;
const ABOVE_START = /^\s*(>=|≥|>|above|over|more than)\s*/i;
// No "<" or "under": those exclude the number, and bands include their upper edge.
const BELOW_START = /^\s*(<=|≤|up ?to|max\.?)\s*/i;
const BELOW_END = /\s*(以内|以下|and below|or less)\s*$/i;
const SEPARATOR = /\s*(?:-|–|—|~|～|－|\bto\b|至|到)\s*/i;

/** One cell holding a range: "5.01 - 10 kg", "1,401–2,600", "10 kg+", ">10", "2601 以上", "≤5". null if it isn't one. */
export function parseRange(text: string): { from: number; to: number | null } | null {
  const t = text.trim();
  if (ABOVE_END.test(t) || ABOVE_START.test(t)) {
    const n = parseNumber(t.replace(ABOVE_END, "").replace(ABOVE_START, ""));
    return Number.isNaN(n) ? null : { from: n, to: null };
  }
  if (BELOW_START.test(t) || BELOW_END.test(t)) {
    const n = parseNumber(t.replace(BELOW_START, "").replace(BELOW_END, ""));
    return Number.isNaN(n) ? null : { from: 0, to: n };
  }
  const parts = t.split(SEPARATOR);
  if (parts.length !== 2) return null;
  const [from, to] = parts.map(parseNumber);
  return Number.isNaN(from) || Number.isNaN(to) ? null : { from, to };
}

// ─── Header → mapping ────────────────────────────────────────

const COUNT = /parcel|count|qty|order|件|数量|包裹|单量/;
const WEIGHT = /weight|kg|重量|公斤/;
const FROM = /from|min|start|起|从|最低|最小/;
const TO = /\bto\b|max|end|至|到|最高|最大/;
const all = (...res: RegExp[]) => (h: string) => res.every((re) => re.test(h));
const MATCH: Record<Field, (header: string) => boolean> = {
  tierFrom: all(COUNT, FROM),
  tierTo: all(COUNT, TO),
  weightFrom: all(WEIGHT, FROM),
  weightTo: all(WEIGHT, TO),
  bike: all(/bike|motor|摩托/),
  car: all(/\bcar\b|汽车|轿车/),
  lorry: all(/lorry|truck|\bvan\b|货车|罗里/),
  rate: all(/rate|price|\brm\b|amount|费率|单价|价格|金额/),
};

/** Best guess at which column holds what, from English or Chinese headers. */
export function guessMapping(headers: string[]): Mapping {
  const norm = headers.map((h) => h.toLowerCase().trim());
  const used = new Set<number>();
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, -1])) as Mapping;
  const take = (field: Field, test: (h: string) => boolean) => {
    const i = norm.findIndex((h, j) => h !== "" && !used.has(j) && test(h));
    if (i >= 0) {
      mapping[field] = i;
      used.add(i);
    }
  };
  for (const f of ["tierFrom", "tierTo", "weightFrom", "weightTo", "bike", "car", "lorry"] as const) take(f, MATCH[f]);
  if ([mapping.bike, mapping.car, mapping.lorry].every((c) => c < 0)) take("rate", MATCH.rate);
  // A lone "Weight" or "Parcels" column holds ranges ("0–5", "10.01+").
  if (mapping.weightFrom < 0 && mapping.weightTo < 0) take("weightFrom", all(WEIGHT));
  if (mapping.tierFrom < 0 && mapping.tierTo < 0) take("tierFrom", all(COUNT));
  return mapping;
}

/** A header row: at least two different cells, one of them naming a rate column. */
export function isHeaderRow(row: string[]): boolean {
  const m = guessMapping(row);
  return new Set(row.map((c) => c.trim()).filter(Boolean)).size >= 2 && [m.bike, m.car, m.lorry, m.rate].some((c) => c >= 0);
}

/** The first header row in the first 20 (title rows above it are skipped), else the first non-empty row. */
export function findHeader(rows: string[][]): number {
  const i = rows.slice(0, 20).findIndex(isHeaderRow);
  return i >= 0 ? i : Math.max(0, rows.findIndex((r) => r.some((c) => c.trim() !== "")));
}

// ─── Rows → config ───────────────────────────────────────────

/** `from` null: the range carries on from the one before (a file with only "up to" edges). `to` null: and above. */
type Range = { from: number | null; to: number | null };

function readRange(cells: string[], fromCol: number, toCol: number): Range | "bad" {
  const from = (cells[fromCol] ?? "").trim();
  const to = (cells[toCol] ?? "").trim();
  if (!from && !to) return { from: null, to: null };
  if (toCol < 0) return parseRange(from) ?? "bad"; // one column holding "0–5", "10.01+"
  const f = from ? parseNumber(from) : null;
  const t = to ? parseNumber(to) : null;
  return Number.isNaN(f) || Number.isNaN(t) ? "bad" : { from: f, to: t };
}

const EPS = 1e-9;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Sorts ranges by upper edge and reports gaps and overlaps. */
function chain<T extends { range: Range; row: number }>(items: T[], step: number, which: "tier" | "band", errors: ImportIssue[]): T[] {
  const top = (x: T) => x.range.to ?? Number.MAX_VALUE;
  const sorted = [...items].sort((a, b) => top(a) - top(b));
  sorted.forEach(({ range: { from, to }, row }, i) => {
    const prev = sorted[i - 1];
    if (!prev) return;
    const edge = prev.range.to;
    if (edge === null) errors.push({ row, key: "import.err.twoOpen" });
    else if (to === edge || (from !== null && from < edge - EPS)) errors.push({ row, key: "import.err.overlap", vars: { other: prev.row } });
    else if (from !== null && from > edge + step + EPS) {
      errors.push({ row, key: which === "tier" ? "import.err.tierGap" : "import.err.bandGap", vars: { from: round3(edge), to: round3(from) } });
    }
  });
  return sorted;
}

export interface ImportResult {
  config: RuleConfig | null;
  errors: ImportIssue[];
  /** Non-blocking: the file was read a certain way; the user should check it. */
  warnings: ImportIssue[];
}

type Band = { range: Range; row: number; rates: number[] };

/**
 * Builds a config from the rows under the header (`firstRow` = the sheet row of rows[0]).
 * `base` gives what a sheet doesn't say: what is counted, the tier basis, per parcel or flat.
 */
export function rowsToConfig(rows: string[][], mapping: Mapping, base: Pick<RuleConfig, "unit" | "basis" | "valueType">, firstRow = 2): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const fail = (key: MessageKey): ImportResult => ({ config: null, errors: [{ row: null, key }], warnings });
  const byVehicle = [mapping.bike, mapping.car, mapping.lorry].some((c) => c >= 0);
  const rateCols = byVehicle ? [mapping.bike, mapping.car, mapping.lorry] : [mapping.rate];
  if (rateCols.some((c) => c < 0)) return fail(byVehicle ? "import.err.vehicleColumns" : "import.err.rateColumn");
  const rangeCols = [mapping.tierFrom, mapping.tierTo, mapping.weightFrom, mapping.weightTo];
  const mapped = [...rangeCols, ...rateCols].filter((c) => c >= 0);

  const tiers = new Map<string, { range: Range; row: number; bands: Band[] }>();
  let count = 0;
  for (const [i, cells] of rows.entries()) {
    const row = firstRow + i;
    const text = (c: number) => (cells[c] ?? "").trim();
    if (mapped.every((c) => !text(c))) continue; // blank, or a note in a column we don't read
    count++;
    const shown = (a: number, b: number) => [text(a), text(b)].filter(Boolean).join(" – ");
    const tier = readRange(cells, mapping.tierFrom, mapping.tierTo);
    if (tier === "bad" || [tier.from, tier.to].some((n) => n !== null && !Number.isInteger(n))) {
      errors.push({ row, key: "import.err.tierRange", vars: { value: shown(mapping.tierFrom, mapping.tierTo) } });
      continue;
    }
    const band = readRange(cells, mapping.weightFrom, mapping.weightTo);
    if (band === "bad" || [band.from, band.to].some((n) => n !== null && decimals(n) > 3)) {
      errors.push({ row, key: "import.err.weightRange", vars: { value: shown(mapping.weightFrom, mapping.weightTo) } });
      continue;
    }
    if ([tier, band].some((r) => r.from !== null && r.to !== null && r.to < r.from)) {
      errors.push({ row, key: "import.err.backwards" });
      continue;
    }
    const rates = rateCols.map((c) => parseNumber(text(c)));
    const bad = rates.findIndex((r) => Number.isNaN(r) || decimals(r) > 4);
    if (bad >= 0) {
      errors.push({ row, key: "import.err.rate", vars: { value: text(rateCols[bad]) || "—" } });
      continue;
    }
    const key = `${tier.from}:${tier.to}`;
    const group = tiers.get(key) ?? { range: tier, row, bands: [] };
    tiers.set(key, group);
    group.bands.push({ range: band, row, rates });
  }
  if (errors.length) return { config: null, errors, warnings };
  if (count === 0) return fail("import.err.empty");
  if (count > 1 && rangeCols.every((c) => c < 0)) return fail("import.err.noRanges");

  const sortedTiers = chain([...tiers.values()], 1, "tier", errors);
  const bandsPerTier = sortedTiers.map((t) => chain(t.bands, 0.01, "band", errors));
  if (errors.length) return { config: null, errors, warnings };

  const firstBands = bandsPerTier[0];
  const bandBounds = firstBands.map((b) => b.range.to);
  sortedTiers.forEach((tier, ti) => {
    const bands = bandsPerTier[ti];
    // The last band is opened below, so only the edges before it must agree.
    if (bands.length !== bandBounds.length || bands.some((b, i) => i < bands.length - 1 && b.range.to !== bandBounds[i])) {
      errors.push({ row: tier.row, key: "import.err.bandsDiffer" });
    }
  });
  if (errors.length) return { config: null, errors, warnings };

  const lastBand = firstBands[firstBands.length - 1];
  if (lastBand.range.to !== null) warnings.push({ row: lastBand.row, key: "import.warn.bandOpened", vars: { to: lastBand.range.to } });
  const firstFrom = firstBands[0].range.from;
  if (firstFrom !== null && firstFrom > 0.01 + EPS) warnings.push({ row: firstBands[0].row, key: "import.warn.bandStart", vars: { from: firstFrom } });
  const lastTier = sortedTiers[sortedTiers.length - 1];
  if (lastTier.range.to !== null) warnings.push({ row: lastTier.row, key: "import.warn.tierOpened", vars: { to: lastTier.range.to } });
  // A card that starts at 1,401 parcels pays nothing below it: add that tier at RM 0.
  const tierFrom = sortedTiers[0].range.from;
  const zeroTier = tierFrom !== null && tierFrom > 1 ? tierFrom - 1 : null;
  if (zeroTier !== null) warnings.push({ row: sortedTiers[0].row, key: "import.warn.tierStart", vars: { from: tierFrom!, to: zeroTier } });

  const open = (list: (number | null)[]) => [...list.slice(0, -1), null];
  const config = {
    ...base,
    tiers: open([...(zeroTier !== null ? [zeroTier] : []), ...sortedTiers.map((t) => t.range.to)]),
    bands: open(bandBounds),
    byVehicle,
    values: [...(zeroTier !== null ? [bandBounds.map(() => rateCols.map(() => 0))] : []), ...bandsPerTier.map((bands) => bands.map((b) => b.rates))],
  };
  if (config.valueType === "flat" && config.bands.length > 1) return fail("rule.err.flatBands");
  const parsed = ruleConfigSchema.safeParse(config);
  if (!parsed.success || configProblems(parsed.data).length > 0) return fail("import.err.limits");
  return { config: parsed.data, errors, warnings };
}

// ─── Config → rows (export, and the file to fill in) ─────────

/** Sheet rows for a config, header first; `headers` are the column names in the UI language. */
export function configToRows(config: RuleConfig, headers: Record<Field, string>): string[][] {
  const tiered = config.tiers.length > 1;
  const banded = config.bands.length > 1;
  const fields: Field[] = [
    ...(tiered ? (["tierFrom", "tierTo"] as const) : []),
    ...(banded ? (["weightFrom", "weightTo"] as const) : []),
    ...(config.byVehicle ? (["bike", "car", "lorry"] as const) : (["rate"] as const)),
  ];
  const tierRanges = boundRanges(config.tiers, 1);
  const bandRanges = boundRanges(config.bands, 0.01);
  const text = (n: number | null) => (n === null ? "" : String(Math.round(n * 10000) / 10000));
  const rows = [fields.map((f) => headers[f])];
  config.values.forEach((tier, ti) =>
    tier.forEach((rates, bi) => {
      rows.push([
        ...(tiered ? [text(tierRanges[ti].from), text(tierRanges[ti].to)] : []),
        ...(banded ? [text(bandRanges[bi].from), text(bandRanges[bi].to)] : []),
        ...rates.map(text),
      ]);
    }),
  );
  return rows;
}
