import { cookies } from "next/headers";
import { lastWorkedPeriod } from "@/lib/v2/payroll/data";
import { periodFromParam, periodOf, type Period } from "@/lib/v2/pay/resolve";

// The month and outlet chosen in the sidebar, kept across Payroll, Penalties and Dispatchers.
export const MONTH_COOKIE = "es-month";
export const OUTLET_COOKIE = "es-outlet";

/** `?month=` first (links into a month), then the sidebar's choice, then the month worked on last, then this month. */
export async function chosenPeriod(agentId: string, param?: string | string[]): Promise<Period> {
  return (
    periodFromParam(param) ??
    periodFromParam((await cookies()).get(MONTH_COOKIE)?.value) ??
    (await lastWorkedPeriod(agentId)) ??
    periodOf(new Date())
  );
}

/** The outlet code chosen in the sidebar, or null for all outlets. Callers ignore codes the account doesn't have. */
export async function chosenOutlet(): Promise<string | null> {
  return (await cookies()).get(OUTLET_COOKIE)?.value || null;
}
