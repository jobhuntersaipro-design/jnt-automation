"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPeriod } from "@/lib/v2/pay/resolve";
import { v2Session, type ActionResult } from "@/lib/v2/session";
import { idOptions } from "./data";

const refresh = () => {
  revalidatePath("/app/success-rates");
  revalidatePath("/app/payroll", "layout");
};

const manual = z.object({ period: z.number().refine(isPeriod), extId: z.string().trim().min(1).max(50), rate: z.number().min(0).max(100) });

/** Types in (or corrects) one J&T ID's success rate for the month. Drafts of that month recalculate when opened. */
export async function setSuccessRate(input: z.input<typeof manual>): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = manual.safeParse(input);
  if (!parsed.success) return { ok: false, error: "error.invalid" };
  const { period, rate } = parsed.data;
  const extId = parsed.data.extId.toUpperCase();
  const id = (await idOptions(s)).find((o) => o.extId === extId);
  // The owner may correct a row for an ID no dispatcher has yet; a supervisor only their branches' people.
  if (!id && s.member) return { ok: false, error: "error.notFound" };
  const rateBp = Math.round(rate * 100);
  await prisma.$transaction([
    prisma.successRate.upsert({
      where: { agentId_period_extId: { agentId: s.agentId, period, extId } },
      create: { agentId: s.agentId, period, extId, name: id?.name ?? null, outlet: id?.outlet ?? null, rateBp, actor: s.actor },
      update: { rateBp, fileName: null, delivered: null, total: null, actor: s.actor },
    }),
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "successRate", detail: { month: period, extId, rateBp } } }),
  ]);
  refresh();
  return { ok: true, data: undefined };
}

export async function deleteSuccessRate(input: { id: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const row = await prisma.successRate.findFirst({ where: { id: input.id, agentId: s.agentId } });
  if (!row) return { ok: false, error: "error.notFound" };
  if (s.member && !(await idOptions(s)).some((o) => o.extId === row.extId)) return { ok: false, error: "error.notFound" };
  await prisma.$transaction([
    prisma.successRate.delete({ where: { id: row.id } }),
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "successRate", detail: { month: row.period, extId: row.extId, removed: true } } }),
  ]);
  refresh();
  return { ok: true, data: undefined };
}
