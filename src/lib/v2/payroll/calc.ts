import { KINDS, PENALTY_TYPES, penaltyTypeOf, penaltyUnit, type Employment, type Kind, type PenaltyType, type RuleConfig, type Vehicle } from "@/lib/v2/pay/config";
import { computePay, totals, UNIT_LETTER, type Line, type Parcels, type ResolvedRule } from "@/lib/v2/pay/engine";
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

/** One penalty case to deduct, in the order the cases happened. */
export interface Charge {
  type: PenaltyType;
  /** The amount in the penalty file; null when it has none. */
  amountCents: number | null;
}

/** A matched penalty case as a run keeps it, so the payslip can itemise it. */
export interface PenaltyCase extends Charge {
  id: string;
  waybill: string | null;
  /** ISO, the wall-clock time from the file. */
  occurredAt: string | null;
  note: string | null;
}

/** Why a dispatcher isn't (fully) paid. Shown on the run and blocks finalising. */
export type Warning =
  | { code: "noProfile" }
  | { code: "noParcelRule" }
  | { code: "noRates"; kind: Kind; rule: string }
  | { code: "noPenaltyAmount"; type: PenaltyType; count: number };

/** ruleId of the line that takes back advances (a deduction, not a rule). */
export const ADVANCE = "advance";

/** What to take back this month: what's owed, but never more than the pay, so net doesn't go below RM 0. */
export const advanceTaken = (owedCents: number, netBeforeCents: number) => Math.max(0, Math.min(owedCents, netBeforeCents));

/** A pay line; penalty lines say which type they deduct. File-amount lines have ruleId `file:<type>`. */
export type PayLine = Line & { penalty?: PenaltyType };

export interface DispatcherPay {
  lines: PayLine[];
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
  penalties?: Charge[];
  /** Advances given and not yet taken back, up to this month. */
  advanceOwedCents?: number;
}): DispatcherPay {
  const { period, profile } = input;
  const charges = input.penalties ?? [];
  // Without a vehicle and type, FT/PT rules can't be matched and per-vehicle rates can't be
  // read: pay nothing rather than something wrong, and say so.
  if (!profile) return { lines: [], warnings: [{ code: "noProfile" }], earningsCents: 0, deductionCents: 0, netCents: 0 };

  const versionOf = (a: AssignmentRow) => inForce(input.versionsOf(a.ruleId), period);
  // Each penalty type is its own slot, so a fake-attempt rule and a lost-parcel rule both apply.
  const slotOf = (a: AssignmentRow) => (a.kind === "PENALTY" ? (versionOf(a)?.config.unit ?? `PENALTY:${a.ruleId}`) : a.kind);
  const picked = pickAssignments(input.assignments, { period, branchId: input.branchId, dispatcherId: input.dispatcherId, employment: profile.employment }, slotOf);
  const warnings: Warning[] = picked.has("PARCEL") ? [] : [{ code: "noParcelRule" }];
  const rules: ResolvedRule[] = [];
  for (const a of picked.values()) {
    const version = versionOf(a);
    if (version) rules.push({ kind: a.kind, ruleId: a.ruleId, versionId: version.id, name: a.ruleName, config: version.config });
    else warnings.push({ code: "noRates", kind: a.kind, rule: a.ruleName });
  }

  // Penalties count after the month's parcels (weight 0), so a rule can escalate with repeat cases.
  const parcels = { w: [...input.parcels.w, ...charges.map(() => 0)], c: input.parcels.c + charges.map((c) => UNIT_LETTER[penaltyUnit(c.type)]).join("") };
  const ruled = new Set<PenaltyType>();
  const lines: PayLine[] = computePay(parcels, profile.vehicle, rules).lines.flatMap((line, i) => {
    const type = penaltyTypeOf(rules[i].config.unit);
    if (!type) return [line];
    ruled.add(type);
    return line.units > 0 ? [{ ...line, penalty: type }] : []; // only months with cases of that type
  });
  // No rule for a type: deduct what the file says, and flag cases the file gives no amount for.
  for (const type of PENALTY_TYPES) {
    const cases = charges.filter((c) => c.type === type);
    if (cases.length === 0 || ruled.has(type)) continue;
    const missing = cases.filter((c) => c.amountCents === null).length;
    if (missing > 0) warnings.push({ code: "noPenaltyAmount", type, count: missing });
    const cents = cases.reduce((sum, c) => sum + (c.amountCents ?? 0), 0);
    lines.push({ kind: "PENALTY", ruleId: `file:${type}`, versionId: "", name: type, penalty: type, units: cases.length, groups: [], cents });
  }
  const order = (l: PayLine) => (l.penalty ? KINDS.length + PENALTY_TYPES.indexOf(l.penalty) : KINDS.indexOf(l.kind));
  const pay = totals(lines.sort((a, b) => order(a) - order(b)));
  // Advances come off last, from what's left: the rest carries to next month.
  const advance = advanceTaken(input.advanceOwedCents ?? 0, pay.netCents);
  if (advance === 0) return { ...pay, warnings };
  return { ...totals([...pay.lines, { kind: "DEDUCTION", ruleId: ADVANCE, versionId: "", name: ADVANCE, units: 1, groups: [], cents: advance }]), warnings };
}
