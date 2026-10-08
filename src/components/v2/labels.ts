import type { I18n } from "@/lib/i18n/core";
import { boundRanges, EMPLOYMENTS, VEHICLES, type Employment, type RuleConfig, type Vehicle } from "@/lib/v2/pay/config";
import { periodMonth, periodYear, type Period } from "@/lib/v2/pay/resolve";

export const monthLabel = (i18n: I18n, p: Period) => i18n.month(periodYear(p), periodMonth(p));

export const vehicleLabel = (i18n: I18n, v: Vehicle) => i18n.t(`vehicle.${v.toLowerCase() as Lowercase<Vehicle>}`);
export const employmentLabel = (i18n: I18n, e: Employment) => i18n.t(e === "FULL_TIME" ? "employment.ft" : "employment.pt");

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

/** Human ranges for tier (count) or band (kg) upper bounds. */
export function rangeLabels(i18n: I18n, bounds: (number | null)[], kind: "count" | "kg"): string[] {
  if (bounds.length === 1) return [i18n.t(kind === "count" ? "rule.anyCount" : "rule.anyWeight")];
  const fmt = (n: number) => i18n.number(n);
  return boundRanges(bounds, kind === "count" ? 1 : 0.01).map(({ from, to }, i) => {
    if (to === null) return i18n.t(kind === "count" ? "rule.countAbove" : "rule.kgAbove", { from: fmt(from) });
    if (i === 0) return i18n.t(kind === "count" ? "rule.countUpTo" : "rule.kgUpTo", { to: fmt(to) });
    return i18n.t(kind === "count" ? "rule.countRange" : "rule.kgRange", { from: fmt(from), to: fmt(to) });
  });
}

/** Short facts about a config for list cards. */
export function configSummary(i18n: I18n, c: RuleConfig): string[] {
  const facts: string[] = [i18n.t(`unit.${c.unit}`)];
  if (c.valueType === "flat") facts.push(i18n.t("valueType.flat"));
  if (c.tiers.length > 1) facts.push(i18n.tp("rules.tierCount", c.tiers.length, { basis: i18n.t(`basis.${c.basis}`) }));
  if (c.bands.length > 1) facts.push(i18n.tp("rules.bandCount", c.bands.length));
  if (c.byVehicle) facts.push(i18n.t("rules.byVehicle"));
  return facts;
}
