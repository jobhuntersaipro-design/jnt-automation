import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { Parcels } from "@/lib/v2/pay/engine";
import { isPeriod, type Period } from "@/lib/v2/pay/resolve";
import { SHEET_LIMITS } from "@/lib/v2/pay/sheet-upload";
import type { PayLine } from "./calc";
import { appValues, MEASURES, type AppPerson, type CheckPlan, type SheetPerson } from "./reconcile";

// Server side of reconciliation: the month's EasyStaff figures, and the stored comparison.

export const checkPlan = z.object({
  period: z.number().refine(isPeriod),
  plan: z.object({
    sheet: z.string().max(200),
    headerRow: z.number().int().min(0).max(SHEET_LIMITS.rows),
    extId: z.number().int().min(0).max(SHEET_LIMITS.cols).optional(),
    name: z.number().int().min(0).max(SHEET_LIMITS.cols).optional(),
    measures: z.array(z.object({ measure: z.enum(MEASURES), column: z.number().int().min(0).max(SHEET_LIMITS.cols) })).min(1).max(MEASURES.length),
  }),
});

export type CheckNotes = Record<string, { note: string; excluded: boolean }>;

export interface CheckView {
  period: Period;
  runs: { id: string; outlet: string; status: "DRAFT" | "FINAL" }[];
  app: AppPerson[];
  check: { fileName: string; updatedAt: string; actor: string | null; plan: CheckPlan; people: SheetPerson[]; notes: CheckNotes } | null;
}

export async function getCheckView(agentId: string, period: Period): Promise<CheckView> {
  const [runs, check] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { agentId, period },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, branch: { select: { code: true } }, results: { select: { dispatcherId: true, extId: true, name: true, parcels: true, lines: true, earningsCents: true, deductionCents: true, netCents: true } } },
    }),
    prisma.payrollCheck.findUnique({ where: { agentId_period: { agentId, period } } }),
  ]);
  return {
    period,
    runs: runs.map((r) => ({ id: r.id, outlet: r.branch.code, status: r.status })),
    app: runs.flatMap((r) =>
      r.results.map((x) => ({
        dispatcherId: x.dispatcherId,
        extId: x.extId,
        name: x.name,
        values: appValues({ ...x, parcels: (x.parcels as unknown as Parcels).w.length, lines: x.lines as unknown as PayLine[] }),
      })),
    ),
    check: check && {
      fileName: check.fileName,
      updatedAt: check.updatedAt.toISOString(),
      actor: check.actor,
      plan: check.plan as unknown as CheckPlan,
      people: check.people as unknown as SheetPerson[],
      notes: (check.notes ?? {}) as CheckNotes,
    },
  };
}

/** Stores the sheet's people for the month; an earlier comparison's notes are kept. */
export async function saveCheck(input: { agentId: string; actor: string | null; period: Period; fileName: string; plan: CheckPlan; people: SheetPerson[] }) {
  const data = { fileName: input.fileName.slice(0, 200), plan: input.plan as unknown as Prisma.InputJsonValue, people: input.people as unknown as Prisma.InputJsonValue, actor: input.actor };
  await prisma.$transaction([
    prisma.payrollCheck.upsert({ where: { agentId_period: { agentId: input.agentId, period: input.period } }, create: { ...data, agentId: input.agentId, period: input.period }, update: data }),
    prisma.ruleAudit.create({ data: { agentId: input.agentId, actor: input.actor, action: "check", detail: { month: input.period, file: data.fileName, people: input.people.length } } }),
  ]);
}
