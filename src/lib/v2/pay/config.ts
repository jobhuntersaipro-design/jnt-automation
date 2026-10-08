import { z } from "zod";
import type { MessageKey } from "@/lib/i18n/en";

// One shape for every v2 pay rule. A rate card, the KPI card, fuel and SC-RTN differ only
// in what they count (`unit`) and their numbers, so a new pay mode is a new rule, not code.

export const KINDS = ["PARCEL", "KPI", "FUEL", "SC", "SC_RTN", "ALLOWANCE", "DEDUCTION"] as const;
export type Kind = (typeof KINDS)[number];
export const VEHICLES = ["BIKE", "CAR", "LORRY"] as const;
export type Vehicle = (typeof VEHICLES)[number];
export const EMPLOYMENTS = ["FULL_TIME", "PART_TIME"] as const;
export type Employment = (typeof EMPLOYMENTS)[number];

/** What a rule counts: normal deliveries, SC parcels or SC-RTN parcels. */
export const UNITS = ["parcels", "sc", "sc_rtn"] as const;
export type Unit = (typeof UNITS)[number];

/**
 * Tier and band edges are upper bounds in ascending order; the last is null ("and above").
 * Stored that way, gaps and overlaps can't exist.
 */
const bounds = z.array(z.number().positive().finite().nullable()).min(1).max(50);

export const ruleConfigSchema = z.object({
  unit: z.enum(UNITS),
  /** per_unit: units × rate. flat: one amount, the rate of the tier the month's count reaches. */
  valueType: z.enum(["per_unit", "flat"]),
  /** whole: the tier reached prices every unit. marginal: each unit is priced by its own position. */
  basis: z.enum(["whole", "marginal"]),
  /** Upper bounds of the monthly count tiers. */
  tiers: bounds,
  /** Upper bounds of the weight bands in kg. [null] = one band. */
  bands: bounds,
  byVehicle: z.boolean(),
  /** RM, indexed [tier][band][vehicle]; the vehicle axis has one entry when !byVehicle. */
  values: z.array(z.array(z.array(z.number().finite().min(0).max(1_000_000)))),
});
export type RuleConfig = z.infer<typeof ruleConfigSchema>;

export interface ConfigProblem {
  key: MessageKey;
  vars?: Record<string, string | number>;
}

export const decimals = (n: number) => (String(n).split(".")[1] ?? "").length;

function boundProblems(list: (number | null)[], wholeNumbers: boolean, which: "tier" | "band"): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  if (list[list.length - 1] !== null) problems.push({ key: which === "tier" ? "rule.err.lastTierOpen" : "rule.err.lastBandOpen" });
  list.slice(0, -1).forEach((b, i) => {
    if (b === null) problems.push({ key: "rule.err.onlyLastOpen", vars: { row: i + 1 } });
    else if (wholeNumbers && !Number.isInteger(b)) problems.push({ key: "rule.err.wholeNumber", vars: { row: i + 1 } });
    else if (!wholeNumbers && decimals(b) > 3) problems.push({ key: "rule.err.weightDecimals", vars: { row: i + 1 } });
    const prev = list[i - 1];
    if (i > 0 && b !== null && prev !== null && prev !== undefined && b <= prev) {
      problems.push({ key: "rule.err.increasing", vars: { row: i + 1 } });
    }
  });
  return problems;
}

/** Everything wrong with a config, in words the editor can show. Empty = valid. */
export function configProblems(config: RuleConfig): ConfigProblem[] {
  const problems = [...boundProblems(config.tiers, true, "tier"), ...boundProblems(config.bands, false, "band")];
  if (config.valueType === "flat" && config.bands.length > 1) problems.push({ key: "rule.err.flatBands" });
  const width = config.byVehicle ? VEHICLES.length : 1;
  const shapeOk =
    config.values.length === config.tiers.length &&
    config.values.every((t) => t.length === config.bands.length && t.every((b) => b.length === width));
  if (!shapeOk) problems.push({ key: "rule.err.shape" });
  else if (config.values.flat(2).some((v) => decimals(v) > 4)) problems.push({ key: "rule.err.rateDecimals" });
  return problems;
}

/** Parses untrusted input (a form post, a JSON column) into a valid config, or null. */
export function parseConfig(input: unknown): RuleConfig | null {
  const parsed = ruleConfigSchema.safeParse(input);
  return parsed.success && configProblems(parsed.data).length === 0 ? parsed.data : null;
}

/** Display ranges for upper bounds: counts step by 1 (1,401–2,600), kg by 0.01 (5.01–10). */
export function boundRanges(list: (number | null)[], step: number): { from: number; to: number | null }[] {
  return list.map((to, i) => {
    const prev = list[i - 1];
    const from = i === 0 ? 0 : prev == null ? 0 : Math.round((prev + step) * 100) / 100;
    return { from, to };
  });
}

// ─── Editor operations: keep the values matrix the same shape as tiers × bands × vehicles ───

const zeros = (n: number) => Array.from({ length: n }, () => 0);

/** Adds a range just below the open "and above" one, starting with that range's rates. */
export function addBound(config: RuleConfig, axis: "tiers" | "bands"): RuleConfig {
  const list = config[axis];
  const lastEdge = list.length > 1 ? (list[list.length - 2] ?? 0) : 0;
  const edge = lastEdge + (axis === "tiers" ? 1000 : 5);
  const at = list.length - 1;
  const nextList = [...list.slice(0, at), edge, null];
  const values =
    axis === "tiers"
      ? [...config.values, config.values[at].map((b) => [...b])]
      : config.values.map((t) => [...t, [...t[at]]]);
  return { ...config, [axis]: nextList, values };
}

/** Sets one edge; configProblems() reports it if it breaks the ascending order. */
export function setBound(config: RuleConfig, axis: "tiers" | "bands", at: number, value: number): RuleConfig {
  if (at >= config[axis].length - 1) return config;
  return { ...config, [axis]: config[axis].map((b, i) => (i === at ? value : b)) };
}

/** Removes a tier (or band); its range joins the next one. The last open range can't go. */
export function removeBound(config: RuleConfig, axis: "tiers" | "bands", at: number): RuleConfig {
  const list = config[axis];
  if (list.length <= 1 || at >= list.length - 1) return config;
  const nextList = list.filter((_, i) => i !== at);
  const values = axis === "tiers" ? config.values.filter((_, i) => i !== at) : config.values.map((t) => t.filter((_, i) => i !== at));
  return { ...config, [axis]: nextList, values };
}

/** Switches rates between one column and one per vehicle (Bike's rates seed the others). */
export function setByVehicle(config: RuleConfig, byVehicle: boolean): RuleConfig {
  if (config.byVehicle === byVehicle) return config;
  const values = config.values.map((t) => t.map((b) => (byVehicle ? VEHICLES.map(() => b[0] ?? 0) : [b[0] ?? 0])));
  return { ...config, byVehicle, values };
}

/** A blank config: one open tier, the given bands, zero rates. */
export function blankConfig(partial: Partial<RuleConfig> = {}): RuleConfig {
  const tiers = partial.tiers ?? [null];
  const bands = partial.bands ?? [null];
  const byVehicle = partial.byVehicle ?? false;
  return {
    unit: "parcels",
    valueType: "per_unit",
    basis: "whole",
    ...partial,
    tiers,
    bands,
    byVehicle,
    values: partial.values ?? tiers.map(() => bands.map(() => zeros(byVehicle ? VEHICLES.length : 1))),
  };
}
