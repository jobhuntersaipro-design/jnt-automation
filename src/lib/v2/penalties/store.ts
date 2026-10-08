import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/v2/session";
import { aliasKey, buildDirectory, matchPenalty, type Directory } from "./match";
import type { PenaltyRow } from "./parse";

// Server side of penalty imports and matching. Every query is scoped by agentId.

export interface ImportSummary {
  importId: string;
  added: number;
  updated: number;
  unchanged: number;
  unmatched: number;
}

/** "2026-10-03" or "2026-10-03T14:22:11" as written in the file, kept as that wall-clock time in UTC. */
const toDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : `${iso}Z`);

export async function loadDirectory(agentId: string): Promise<Directory> {
  const [people, aliases] = await Promise.all([
    prisma.dispatcher.findMany({
      where: { agentId, branch: { isDemo: false } },
      select: { id: true, name: true, assignments: { select: { extId: true, branch: { select: { code: true } } } } },
    }),
    prisma.penaltyAlias.findMany({ where: { agentId }, select: { key: true, dispatcherId: true } }),
  ]);
  return buildDirectory(
    people.map((p) => ({ id: p.id, name: p.name, ids: p.assignments.map((a) => ({ extId: a.extId, outlet: a.branch.code })) })),
    aliases,
  );
}

const COMPARED = ["waybill", "extId", "name", "who", "outlet", "amountCents", "appeal", "note", "status", "dispatcherId", "waived"] as const;
type Fields = Omit<Prisma.PenaltyItemCreateManyInput, "agentId" | "importId" | "period" | "type" | "key"> & { occurredAt: Date | null };

/**
 * Adds a month's cases. A case already imported (same type and key) is updated in place, so
 * importing a file again never counts it twice; a waive someone set by hand is kept.
 */
export async function importPenalties(input: { agentId: string; actor: string | null; fileName: string; period: number; rows: PenaltyRow[] }): Promise<ActionResult<ImportSummary>> {
  const { agentId, period, rows } = input;
  if (rows.length === 0) return { ok: false, error: "penalty.err.noRows" };
  const dir = await loadDirectory(agentId);
  const existing = await prisma.penaltyItem.findMany({ where: { agentId, period, key: { in: [...new Set(rows.map((r) => r.key))] } } });
  const byKey = new Map(existing.map((e) => [`${e.type}|${e.key}`, e]));

  let unmatched = 0;
  const added: (Fields & { type: PenaltyRow["type"]; key: string })[] = [];
  const changed: { id: string; data: Fields }[] = [];
  for (const r of rows) {
    const match = matchPenalty(r, dir);
    if (match.status === "UNMATCHED") unmatched++;
    const old = byKey.get(`${r.type}|${r.key}`);
    const data: Fields = {
      waybill: r.waybill,
      extId: r.extId,
      name: r.name,
      who: aliasKey(r),
      outlet: r.outlet,
      occurredAt: r.occurredAt ? toDate(r.occurredAt) : null,
      amountCents: r.amountCents,
      appeal: r.appeal,
      note: r.note,
      status: match.status,
      dispatcherId: match.dispatcherId,
      waived: old?.waivedBy ? old.waived : r.waived,
    };
    if (!old) added.push({ ...data, type: r.type, key: r.key });
    else if (COMPARED.some((f) => old[f] !== data[f]) || old.occurredAt?.getTime() !== data.occurredAt?.getTime()) changed.push({ id: old.id, data });
  }

  const fileName = input.fileName.slice(0, 200);
  const importId = await prisma.$transaction(
    async (tx) => {
      const file = await tx.penaltyImport.create({
        data: { agentId, period, fileName, rows: rows.length, added: added.length, updated: changed.length, actor: input.actor },
        select: { id: true },
      });
      await tx.penaltyItem.createMany({ data: added.map((a) => ({ ...a, agentId, period, importId: file.id })) });
      for (const c of changed) await tx.penaltyItem.update({ where: { id: c.id }, data: c.data });
      await tx.ruleAudit.create({ data: { agentId, actor: input.actor, action: "penaltyImport", detail: { month: period, file: fileName, added: added.length, updated: changed.length } } });
      return file.id;
    },
    { timeout: 60_000 },
  );
  return { ok: true, data: { importId, added: added.length, updated: changed.length, unchanged: rows.length - added.length - changed.length, unmatched } };
}

/** Matches every case with this identity again, after a decision about it changed. */
export async function rematch(agentId: string, who: string) {
  const dir = await loadDirectory(agentId);
  const items = await prisma.penaltyItem.findMany({ where: { agentId, who }, select: { id: true, extId: true, name: true, outlet: true } });
  const groups = new Map<string, { status: "MATCHED" | "UNMATCHED" | "IGNORED"; dispatcherId: string | null; ids: string[] }>();
  for (const item of items) {
    const m = matchPenalty(item, dir);
    const k = `${m.status}|${m.dispatcherId}`;
    groups.set(k, { ...m, ids: [...(groups.get(k)?.ids ?? []), item.id] });
  }
  await prisma.$transaction([...groups.values()].map((g) => prisma.penaltyItem.updateMany({ where: { id: { in: g.ids } }, data: { status: g.status, dispatcherId: g.dispatcherId } })));
}
