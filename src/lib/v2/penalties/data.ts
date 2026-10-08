import { prisma } from "@/lib/prisma";
import type { PenaltyType } from "@/lib/v2/pay/config";
import type { Period } from "@/lib/v2/pay/resolve";

// Read models for the v2 penalties screen. Every query is scoped by agentId.

export type PenaltyStatus = "MATCHED" | "UNMATCHED" | "IGNORED";

export interface PenaltyItemView {
  id: string;
  type: PenaltyType;
  waybill: string | null;
  extId: string | null;
  name: string | null;
  outlet: string | null;
  /** ISO, the wall-clock time from the file. */
  occurredAt: string | null;
  amountCents: number | null;
  appeal: string | null;
  note: string | null;
  waived: boolean;
  status: PenaltyStatus;
  /** Someone matched or ignored this person by hand; it can be undone. */
  decided: boolean;
  dispatcher: { id: string; name: string } | null;
  fileName: string;
}

export interface PenaltyImportView {
  id: string;
  fileName: string;
  rows: number;
  added: number;
  updated: number;
  /** Cases still here that this import added. */
  items: number;
  actor: string | null;
  createdAt: string;
}

export interface PenaltyMonth {
  period: Period;
  items: PenaltyItemView[];
  imports: PenaltyImportView[];
}

export async function getPenaltyMonth(agentId: string, period: Period): Promise<PenaltyMonth> {
  const [items, imports, aliases] = await Promise.all([
    prisma.penaltyItem.findMany({
      where: { agentId, period },
      orderBy: [{ occurredAt: { sort: "asc", nulls: "last" } }, { key: "asc" }],
      include: { dispatcher: { select: { id: true, name: true } }, file: { select: { fileName: true } } },
    }),
    prisma.penaltyImport.findMany({ where: { agentId, period }, orderBy: { createdAt: "desc" }, include: { _count: { select: { items: true } } } }),
    prisma.penaltyAlias.findMany({ where: { agentId }, select: { key: true } }),
  ]);
  const decided = new Set(aliases.map((a) => a.key));
  return {
    period,
    items: items.map((i) => ({
      id: i.id,
      type: i.type,
      waybill: i.waybill,
      extId: i.extId,
      name: i.name,
      outlet: i.outlet,
      occurredAt: i.occurredAt?.toISOString().slice(0, 19) ?? null,
      amountCents: i.amountCents,
      appeal: i.appeal,
      note: i.note,
      waived: i.waived,
      status: i.status,
      decided: i.who ? decided.has(i.who) : i.status !== "UNMATCHED",
      dispatcher: i.dispatcher,
      fileName: i.file.fileName,
    })),
    imports: imports.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      rows: f.rows,
      added: f.added,
      updated: f.updated,
      items: f._count.items,
      actor: f.actor,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

export interface PersonOption {
  id: string;
  name: string;
  /** "KUL4602 · KUL4602001", for telling people with the same name apart. */
  detail: string;
}

export async function listPersonOptions(agentId: string): Promise<PersonOption[]> {
  const people = await prisma.dispatcher.findMany({
    where: { agentId, branch: { isDemo: false } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, assignments: { select: { extId: true, branch: { select: { code: true } } } } },
  });
  return people.map((p) => ({ id: p.id, name: p.name, detail: p.assignments.map((a) => `${a.branch.code} · ${a.extId}`).join(", ") }));
}
