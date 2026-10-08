"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { v2Session, type ActionResult } from "@/lib/v2/session";
import { rematch } from "./store";

// Decisions on imported penalty cases. A match or ignore is about the person the file names,
// so it applies to every case naming them and is remembered for later files.

type Detail = Record<string, string | number | boolean | null>;

function refresh() {
  revalidatePath("/app/penalties");
  revalidatePath("/app/payroll", "layout");
}

const audit = (agentId: string, actor: string | null, action: string, detail: Detail) => prisma.ruleAudit.create({ data: { agentId, actor, action, detail } });

const ownItem = (agentId: string, id: string) =>
  prisma.penaltyItem.findFirst({ where: { id, agentId }, select: { id: true, who: true, extId: true, name: true, waybill: true, period: true, type: true } });

const label = (item: { extId: string | null; name: string | null; waybill: string | null }) => item.name ?? item.extId ?? item.waybill ?? "";

type Item = NonNullable<Awaited<ReturnType<typeof ownItem>>>;

/** Records who the person in the file is (null = ignore them) for this case and every case naming them. */
async function decide(s: { agentId: string; actor: string | null }, item: Item, dispatcherId: string | null, detail: Detail): Promise<number> {
  const alias = item.who
    ? [
        prisma.penaltyAlias.upsert({
          where: { agentId_key: { agentId: s.agentId, key: item.who } },
          create: { agentId: s.agentId, key: item.who, dispatcherId, actor: s.actor },
          update: { dispatcherId, actor: s.actor },
        }),
      ]
    : [];
  const [updated] = await prisma.$transaction([
    prisma.penaltyItem.updateMany({
      where: item.who ? { agentId: s.agentId, who: item.who } : { id: item.id },
      data: { status: dispatcherId ? "MATCHED" : "IGNORED", dispatcherId },
    }),
    audit(s.agentId, s.actor, dispatcherId ? "penaltyMatch" : "penaltyIgnore", { from: label(item), ...detail }),
    ...alias,
  ]);
  refresh();
  return updated.count;
}

/** Links the case, and every case naming the same person, to a dispatcher. */
export async function assignPenalty(input: { itemId: string; dispatcherId: string }): Promise<ActionResult<{ count: number }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const [item, person] = await Promise.all([
    ownItem(s.agentId, input.itemId),
    prisma.dispatcher.findFirst({ where: { id: input.dispatcherId, agentId: s.agentId, branch: { isDemo: false } }, select: { id: true, name: true } }),
  ]);
  if (!item || !person) return { ok: false, error: "error.notFound" };
  return { ok: true, data: { count: await decide(s, item, person.id, { dispatcher: person.name }) } };
}

/** Leaves the case, and every case naming the same person, out of payroll (e.g. a hub's ID). */
export async function ignorePenalty(input: { itemId: string }): Promise<ActionResult<{ count: number }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const item = await ownItem(s.agentId, input.itemId);
  if (!item) return { ok: false, error: "error.notFound" };
  return { ok: true, data: { count: await decide(s, item, null, {}) } };
}

/** Forgets the match or ignore for this person; their cases are matched again automatically. */
export async function undoPenaltyDecision(input: { itemId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const item = await ownItem(s.agentId, input.itemId);
  if (!item) return { ok: false, error: "error.notFound" };
  if (item.who) {
    await prisma.penaltyAlias.deleteMany({ where: { agentId: s.agentId, key: item.who } });
    await rematch(s.agentId, item.who);
  } else {
    await prisma.penaltyItem.update({ where: { id: item.id }, data: { status: "UNMATCHED", dispatcherId: null } });
  }
  await audit(s.agentId, s.actor, "penaltyUndo", { from: label(item) });
  refresh();
  return { ok: true, data: undefined };
}

/** Waives a case (an accepted appeal the file doesn't show yet) or charges it again. Later imports keep this. */
export async function setPenaltyWaived(input: { itemId: string; waived: boolean }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const item = await ownItem(s.agentId, input.itemId);
  if (!item) return { ok: false, error: "error.notFound" };
  await prisma.$transaction([
    prisma.penaltyItem.update({ where: { id: item.id }, data: { waived: input.waived, waivedBy: s.actor ?? "manual" } }),
    audit(s.agentId, s.actor, "penaltyWaive", { case: item.waybill ?? label(item), waived: input.waived, month: item.period }),
  ]);
  refresh();
  return { ok: true, data: undefined };
}

/** Removes a file's import: the cases it added go; cases it only updated stay as updated. */
export async function deletePenaltyImport(input: { importId: string }): Promise<ActionResult<{ count: number }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const file = await prisma.penaltyImport.findFirst({ where: { id: input.importId, agentId: s.agentId }, select: { id: true, fileName: true, period: true, _count: { select: { items: true } } } });
  if (!file) return { ok: false, error: "error.notFound" };
  await prisma.$transaction([
    prisma.penaltyImport.delete({ where: { id: file.id } }),
    audit(s.agentId, s.actor, "penaltyDeleteImport", { file: file.fileName, month: file.period, removed: file._count.items }),
  ]);
  refresh();
  return { ok: true, data: { count: file._count.items } };
}
