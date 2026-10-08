import { VEHICLES, type Kind, type RuleConfig, type Unit, type Vehicle } from "./config";

/**
 * A dispatcher's parcels for the month, in delivery order (marginal tiers need the order).
 * `w` = billing weight in kg; `c` = one letter per parcel: n normal, s SC, r SC-RTN.
 */
export interface Parcels {
  w: number[];
  c: string;
}

export const UNIT_LETTER: Record<Unit, string> = { parcels: "n", sc: "s", sc_rtn: "r" };

/** Index of the range a value falls in: the first upper bound it doesn't exceed (null = no limit). */
export function boundIndex(x: number, bounds: (number | null)[]): number {
  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i];
    if (b === null || x <= b) return i;
  }
  return bounds.length - 1;
}

/** units × rate in cents, rounded half up once. Rates carry up to 4 decimals. */
export function toCents(units: number, rate: number): number {
  return Math.round((units * Math.round(rate * 10000)) / 100);
}

export interface Group {
  tier: number;
  band: number;
  units: number;
  rate: number;
  cents: number;
}

export interface RuleResult {
  /** How many units the rule counted (parcels of its kind). */
  units: number;
  /** One group per tier × band that has units, in tier then band order. */
  groups: Group[];
  cents: number;
}

export function computeRule(config: RuleConfig, parcels: Parcels, vehicle: Vehicle): RuleResult {
  const letter = UNIT_LETTER[config.unit];
  const v = config.byVehicle ? VEHICLES.indexOf(vehicle) : 0;
  let units = 0;
  for (let i = 0; i < parcels.c.length; i++) if (parcels.c[i] === letter) units++;

  if (config.valueType === "flat") {
    const tier = boundIndex(units, config.tiers);
    const rate = config.values[tier][0][v];
    const cents = toCents(1, rate);
    return { units, groups: [{ tier, band: 0, units: 1, rate, cents }], cents };
  }

  const wholeTier = config.basis === "whole" ? boundIndex(units, config.tiers) : -1;
  const counts = new Map<number, number>();
  let position = 0;
  for (let i = 0; i < parcels.c.length; i++) {
    if (parcels.c[i] !== letter) continue;
    position++;
    const tier = wholeTier >= 0 ? wholeTier : boundIndex(position, config.tiers);
    const band = boundIndex(parcels.w[i], config.bands);
    const key = tier * 10000 + band;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const groups = [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, n]) => {
      const tier = Math.floor(key / 10000);
      const band = key % 10000;
      const rate = config.values[tier][band][v];
      return { tier, band, units: n, rate, cents: toCents(n, rate) };
    });
  return { units, groups, cents: groups.reduce((sum, g) => sum + g.cents, 0) };
}

export interface ResolvedRule {
  kind: Kind;
  ruleId: string;
  versionId: string;
  name: string;
  config: RuleConfig;
}

export interface Line extends RuleResult {
  kind: Kind;
  ruleId: string;
  versionId: string;
  name: string;
}

export interface Pay {
  lines: Line[];
  earningsCents: number;
  deductionCents: number;
  netCents: number;
}

/** One dispatcher's month: every resolved rule applied to their parcels. DEDUCTION lines subtract. */
export function computePay(parcels: Parcels, vehicle: Vehicle, rules: ResolvedRule[]): Pay {
  const lines = rules.map((r) => ({ kind: r.kind, ruleId: r.ruleId, versionId: r.versionId, name: r.name, ...computeRule(r.config, parcels, vehicle) }));
  const deductionCents = lines.filter((l) => l.kind === "DEDUCTION").reduce((s, l) => s + l.cents, 0);
  const earningsCents = lines.filter((l) => l.kind !== "DEDUCTION").reduce((s, l) => s + l.cents, 0);
  return { lines, earningsCents, deductionCents, netCents: earningsCents - deductionCents };
}
