import { blankConfig, VEHICLES, type Kind, type RuleConfig } from "./config";

const perVehicle = (...rates: number[]) => rates.map((r) => VEHICLES.map(() => r));

/** Starting numbers for a new rule of each kind; every number is editable before saving. */
export const TEMPLATES: Record<Kind, RuleConfig> = {
  // v1's default weight tiers, for every vehicle.
  PARCEL: { ...blankConfig({ bands: [5, 10, null], byVehicle: true }), values: [perVehicle(1, 1.4, 2.2)] },
  // Paid per parcel past 1,400 a month, by weight and vehicle. Marginal, like v1's bonus tiers.
  KPI: { ...blankConfig({ tiers: [1400, 2600, null], bands: [5, 10, null], byVehicle: true }), basis: "marginal" },
  FUEL: blankConfig(),
  SC: blankConfig({ unit: "sc" }),
  SC_RTN: blankConfig({ unit: "sc_rtn" }),
  ALLOWANCE: blankConfig({ valueType: "flat" }),
  DEDUCTION: blankConfig({ valueType: "flat" }),
};
