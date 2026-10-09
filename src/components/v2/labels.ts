import type { I18n } from "@/lib/i18n/core";
import { boundRanges, EMPLOYMENTS, penaltyTypeOf, VEHICLES, type Employment, type PenaltyType, type RuleConfig, type Unit, type Vehicle } from "@/lib/v2/pay/config";
import { periodMonth, periodYear, type Period } from "@/lib/v2/pay/resolve";
import type { Warning } from "@/lib/v2/payroll/calc";

export const monthLabel = (i18n: I18n, p: Period) => i18n.month(periodYear(p), periodMonth(p));

export const vehicleLabel = (i18n: I18n, v: Vehicle) => i18n.t(`vehicle.${v.toLowerCase() as Lowercase<Vehicle>}`);
export const employmentLabel = (i18n: I18n, e: Employment) => i18n.t(e === "FULL_TIME" ? "employment.ft" : "employment.pt");
export const penaltyLabel = (i18n: I18n, type: PenaltyType) => i18n.t(`penalty.type.${type}`);
/** What a rule counts: "Delivered parcels", or a penalty type. */
export function unitLabel(i18n: I18n, unit: Unit) {
  const type = penaltyTypeOf(unit);
  return type ? penaltyLabel(i18n, type) : i18n.t(`unit.${unit as "parcels" | "sc" | "sc_rtn" | "success_rate"}`);
}

/** Every vehicle × FT/PT pair, for one select that sets a whole dispatcher profile. */
export const PROFILES = VEHICLES.flatMap((vehicle) => EMPLOYMENTS.map((employment) => ({ key: `${vehicle}:${employment}`, vehicle, employment })));
export const profileKey = (p: { vehicle: Vehicle; employment: Employment }) => `${p.vehicle}:${p.employment}`;
/** "Bike · Part-time". */
export const profileLabel = (i18n: I18n, p: { vehicle: Vehicle; employment: Employment }) =>
  i18n.t("profile.option", { vehicle: vehicleLabel(i18n, p.vehicle), employment: employmentLabel(i18n, p.employment) });

/** "Everyone", "Part-time", "KUL4602 · Part-time", "Ahmad Faiz". */
export function scopeLabel(i18n: I18n, a: { branchCode: string | null; dispatcherName: string | null; employment: Employment | null }) {
  const parts = [a.dispatcherName, a.branchCode, a.employment && employmentLabel(i18n, a.employment)].filter(Boolean);
  return parts.length ? parts.join(" · ") : i18n.t("applies.everyone");
}

/** The heading over a tier's rates: parcels, penalty cases, or a success-rate range. */
export const tierHeadingKey = (c: Pick<RuleConfig, "unit">) =>
  c.unit === "success_rate" ? "rule.tierHeadingRate" : penaltyTypeOf(c.unit) ? "rule.tierHeadingCases" : "rule.tierHeading";

/** What a rule's tiers measure: a monthly count, or (success-rate bonus) a percentage. */
export const tierScale = (c: Pick<RuleConfig, "unit">): "count" | "pct" => (c.unit === "success_rate" ? "pct" : "count");

const RANGE_KEYS = {
  count: { any: "rule.anyCount", above: "rule.countAbove", upTo: "rule.countUpTo", range: "rule.countRange" },
  pct: { any: "rule.anyRate", above: "rule.pctAbove", upTo: "rule.pctUpTo", range: "rule.pctRange" },
  kg: { any: "rule.anyWeight", above: "rule.kgAbove", upTo: "rule.kgUpTo", range: "rule.kgRange" },
} as const;

/** Human ranges for tier (count or %) or band (kg) upper bounds. */
export function rangeLabels(i18n: I18n, bounds: (number | null)[], kind: "count" | "pct" | "kg"): string[] {
  const keys = RANGE_KEYS[kind];
  if (bounds.length === 1) return [i18n.t(keys.any)];
  const fmt = (n: number) => i18n.number(n);
  return boundRanges(bounds, kind === "count" ? 1 : 0.01).map(({ from, to }, i) => {
    if (to === null) return i18n.t(keys.above, { from: fmt(from) });
    if (i === 0) return i18n.t(keys.upTo, { to: fmt(to) });
    return i18n.t(keys.range, { from: fmt(from), to: fmt(to) });
  });
}

/** Why a dispatcher isn't (fully) paid, in words. */
export function warningText(i18n: I18n, w: Warning): string {
  if (w.code === "noProfile") return i18n.t("run.warn.noProfile");
  if (w.code === "noParcelRule") return i18n.t("run.warn.noParcelRule");
  if (w.code === "noSuccessRate") return i18n.t("run.warn.noSuccessRate");
  if (w.code === "noPenaltyAmount") return i18n.tp("run.warn.noPenaltyAmount", w.count, { type: penaltyLabel(i18n, w.type) });
  return i18n.t("run.warn.noRates", { rule: w.rule, kind: i18n.t(`kind.${w.kind}`) });
}

/** Short facts about a config for list cards. */
export function configSummary(i18n: I18n, c: RuleConfig): string[] {
  const facts: string[] = [unitLabel(i18n, c.unit)];
  if (c.valueType === "flat") facts.push(i18n.t("valueType.flat"));
  if (c.tiers.length > 1) facts.push(i18n.tp("rules.tierCount", c.tiers.length, { basis: i18n.t(`basis.${c.basis}`) }));
  if (c.bands.length > 1) facts.push(i18n.tp("rules.bandCount", c.bands.length));
  if (c.byVehicle) facts.push(i18n.t("rules.byVehicle"));
  return facts;
}
