import type { Employment, Kind, RuleConfig, Vehicle } from "@/lib/v2/pay/config";
import { computePay, type Line, type Parcels, type ResolvedRule } from "@/lib/v2/pay/engine";
import { inForce, pickAssignments, type AssignmentRow, type Period } from "@/lib/v2/pay/resolve";

// One dispatcher's pay in a run: pick the rules that apply, take their rates for the month,
// run the engine. Pure, so the run and its tests resolve exactly the same way.

export interface VersionRow {
  id: string;
  ruleId: string;
  effectiveFrom: Period;
  config: RuleConfig;
}

export interface Profile {
  vehicle: Vehicle;
  employment: Employment;
  effectiveFrom: Period;
}

/** Why a dispatcher isn't (fully) paid. Shown on the run and blocks finalising. */
export type Warning = { code: "noProfile" } | { code: "noParcelRule" } | { code: "noRates"; kind: Kind; rule: string };

export interface DispatcherPay {
  lines: Line[];
  warnings: Warning[];
  earningsCents: number;
  deductionCents: number;
  netCents: number;
}

export function payDispatcher(input: {
  period: Period;
  branchId: string;
  dispatcherId: string;
  parcels: Parcels;
  profile: Profile | null;
  assignments: (AssignmentRow & { ruleName: string })[];
  versionsOf: (ruleId: string) => VersionRow[];
}): DispatcherPay {
  const { period, profile } = input;
  // Without a vehicle and type, FT/PT rules can't be matched and per-vehicle rates can't be
  // read: pay nothing rather than something wrong, and say so.
  if (!profile) return { lines: [], warnings: [{ code: "noProfile" }], earningsCents: 0, deductionCents: 0, netCents: 0 };

  const picked = pickAssignments(input.assignments, { period, branchId: input.branchId, dispatcherId: input.dispatcherId, employment: profile.employment });
  const warnings: Warning[] = picked.has("PARCEL") ? [] : [{ code: "noParcelRule" }];
  const rules: ResolvedRule[] = [];
  for (const [kind, a] of picked) {
    const version = inForce(input.versionsOf(a.ruleId), period);
    if (version) rules.push({ kind, ruleId: a.ruleId, versionId: version.id, name: a.ruleName, config: version.config });
    else warnings.push({ code: "noRates", kind, rule: a.ruleName });
  }
  return { ...computePay(input.parcels, profile.vehicle, rules), warnings };
}
