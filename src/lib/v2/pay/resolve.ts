import { KINDS, type Employment, type Kind } from "./config";

// Which rule and which version applies to a dispatcher in a month. Pure, so the payroll
// run and the rule simulator resolve exactly the same way.

/** yyyymm, e.g. 202611. Compares correctly as a number. */
export type Period = number;

export const toPeriod = (year: number, month: number): Period => year * 100 + month;
export const periodYear = (p: Period) => Math.floor(p / 100);
export const periodMonth = (p: Period) => p % 100;
/** The month before: 202601 → 202512. */
export const prevPeriod = (p: Period) => (periodMonth(p) === 1 ? p - 89 : p - 1);
/** "2026-11" (the value of an <input type="month">) ⇄ 202611. */
export const periodToInput = (p: Period) => `${periodYear(p)}-${String(periodMonth(p)).padStart(2, "0")}`;
/** The payroll month a moment falls in, in Malaysian time. */
export function periodOf(date: Date): Period {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" })
    .format(date)
    .split("-")
    .map(Number);
  return toPeriod(year, month);
}

export function periodFromInput(value: string): Period | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? toPeriod(Number(m[1]), month) : null;
}

/** A real month between 2000 and 2999. */
export const isPeriod = (p: number) => Number.isInteger(p) && p >= 200001 && p <= 299912 && periodMonth(p) >= 1 && periodMonth(p) <= 12;

/** A `?month=202611` search param, or null. */
export function periodFromParam(value: string | string[] | undefined): Period | null {
  const p = Number(value);
  return typeof value === "string" && isPeriod(p) ? p : null;
}

export interface AssignmentRow {
  id: string;
  kind: Kind;
  ruleId: string;
  branchId: string | null;
  dispatcherId: string | null;
  employment: Employment | null;
  effectiveFrom: Period;
  createdAt: Date;
}

export interface Context {
  period: Period;
  branchId: string;
  dispatcherId: string;
  /** null when the dispatcher has no profile yet: FT/PT-only assignments then don't match. */
  employment: Employment | null;
}

/** dispatcher > outlet > FT/PT > everyone; an outlet + FT/PT assignment beats either alone. */
export const specificity = (a: AssignmentRow) => (a.dispatcherId ? 4 : 0) + (a.branchId ? 2 : 0) + (a.employment ? 1 : 0);

function matches(a: AssignmentRow, ctx: Context) {
  return (
    a.effectiveFrom <= ctx.period &&
    (a.dispatcherId === null || a.dispatcherId === ctx.dispatcherId) &&
    (a.branchId === null || a.branchId === ctx.branchId) &&
    (a.employment === null || a.employment === ctx.employment)
  );
}

/**
 * The winning assignment per slot: most specific, then the latest effective month, then the newest.
 * A slot is the kind, except penalty rules, which get one slot per penalty type (see `slotOf`).
 */
export function pickAssignments<T extends AssignmentRow>(assignments: T[], ctx: Context, slotOf: (a: T) => string = (a) => a.kind): Map<string, T> {
  const best = new Map<string, T>();
  for (const a of assignments) {
    if (!matches(a, ctx)) continue;
    const slot = slotOf(a);
    const current = best.get(slot);
    if (
      !current ||
      specificity(a) > specificity(current) ||
      (specificity(a) === specificity(current) &&
        (a.effectiveFrom > current.effectiveFrom || (a.effectiveFrom === current.effectiveFrom && a.createdAt > current.createdAt)))
    ) {
      best.set(slot, a);
    }
  }
  return new Map([...best].sort(([sa, a], [sb, b]) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || sa.localeCompare(sb)));
}

/**
 * A dispatcher's vehicle and type changed this month: the row in force starts this month and differs from the one
 * before it. Returns both rows, or null when nothing changed (a first-ever setting isn't a change).
 */
export function monthChange<T extends { effectiveFrom: Period; vehicle: string; employment: string }>(rows: T[], period: Period) {
  const to = inForce(rows, period);
  if (!to || to.effectiveFrom !== period) return null;
  const from = inForce(rows, prevPeriod(period));
  if (!from || (from.vehicle === to.vehicle && from.employment === to.employment)) return null;
  return { from, to };
}

/** The row in force for a month: the latest `effectiveFrom` not after it, or null. */
export function inForce<T extends { effectiveFrom: Period }>(rows: T[], period: Period): T | null {
  let found: T | null = null;
  for (const row of rows) {
    if (row.effectiveFrom <= period && (!found || row.effectiveFrom > found.effectiveFrom)) found = row;
  }
  return found;
}
