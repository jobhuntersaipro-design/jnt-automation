"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPeriod } from "@/lib/v2/pay/resolve";
import { ADVANCE, type PayLine } from "@/lib/v2/payroll/calc";
import { dispatcherScope, v2Session, type ActionResult } from "@/lib/v2/session";

const refresh = () => {
  revalidatePath("/app/advances");
  revalidatePath("/app/payroll", "layout");
};

const input = z.object({
  dispatcherId: z.string().min(1),
  period: z.number().refine(isPeriod),
  amountCents: z.number().int().positive().max(100_000_00),
  note: z.string().trim().max(200).optional(),
});

/** Records an advance; that month's draft takes it back (as much as the pay allows) when it's next worked out. */
export async function addAdvance(raw: z.input<typeof input>): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "error.invalid" };
  const a = parsed.data;
  const person = await prisma.dispatcher.findFirst({ where: { id: a.dispatcherId, agentId: s.agentId, ...dispatcherScope(s) }, select: { name: true } });
  if (!person) return { ok: false, error: "error.notFound" };
  await prisma.$transaction([
    prisma.advance.create({ data: { agentId: s.agentId, dispatcherId: a.dispatcherId, period: a.period, amountCents: a.amountCents, note: a.note || null, createdBy: s.actor } }),
    // Logged so drafts know their pay changed and are worked out again.
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "advance", detail: { dispatcher: person.name, month: a.period, cents: a.amountCents } } }),
  ]);
  refresh();
  return { ok: true, data: undefined };
}

/** Removes an advance, unless finalised pay already took advances back from that month on. */
export async function deleteAdvance(raw: { id: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const advance = await prisma.advance.findFirst({ where: { id: raw.id, agentId: s.agentId, dispatcher: dispatcherScope(s) }, include: { dispatcher: { select: { name: true } } } });
  if (!advance) return { ok: false, error: "error.notFound" };
  const finals = await prisma.payrollResult.findMany({
    where: { dispatcherId: advance.dispatcherId, run: { agentId: s.agentId, status: "FINAL", period: { gte: advance.period } } },
    select: { lines: true },
  });
  if (finals.some((r) => (r.lines as unknown as PayLine[]).some((l) => l.ruleId === ADVANCE))) return { ok: false, error: "advance.err.locked" };
  await prisma.$transaction([
    prisma.advance.delete({ where: { id: advance.id } }),
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "advanceDelete", detail: { dispatcher: advance.dispatcher.name, month: advance.period, cents: advance.amountCents } } }),
  ]);
  refresh();
  return { ok: true, data: undefined };
}
