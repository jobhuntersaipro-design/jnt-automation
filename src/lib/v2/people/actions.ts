"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizePhone } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { EMPLOYMENTS, VEHICLES } from "@/lib/v2/pay/config";
import { isPeriod } from "@/lib/v2/pay/resolve";
import type { Parcels } from "@/lib/v2/pay/engine";
import { calculateRun } from "@/lib/v2/payroll/run";
import { planMerge, profilesToMove } from "@/lib/v2/people/merge";
import { ensureOutlet } from "@/lib/v2/people/outlet";
import { v2Session, type ActionResult } from "@/lib/v2/session";

// Mutations behind the v2 outlet and dispatcher screens. Each one checks the caller is a
// v2 account, touches only that account's rows, and leaves an audit entry.

const outletCode = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9-]{2,20}$/));

export async function createOutlet(input: { code: string }): Promise<ActionResult<{ id: string; code: string }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const code = outletCode.safeParse(input.code);
  if (!code.success) return { ok: false, error: "outlets.err.code" };
  const outlet = await ensureOutlet(s.agentId, code.data);
  if (!outlet.ok) return outlet;
  if (!outlet.data.created) return { ok: false, error: "outlets.err.exists" };
  await prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "outlet", detail: { outlet: outlet.data.code } } });
  revalidatePath("/app/branches");
  return { ok: true, data: { id: outlet.data.id, code: outlet.data.code } };
}

const profileInput = z.object({
  dispatcherIds: z.array(z.string().min(1)).min(1).max(5000),
  effectiveFrom: z.number().refine(isPeriod),
  vehicle: z.enum(VEHICLES),
  employment: z.enum(EMPLOYMENTS),
});

/** A dispatcher's mobile number for payslip links; empty clears it. Malaysian 0… numbers are kept as typed. */
export async function setPhone(input: { dispatcherId: string; phone: string }): Promise<ActionResult<{ phone: string | null }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const phone = input.phone.trim() ? normalizePhone(input.phone) : null;
  if (input.phone.trim() && !phone) return { ok: false, error: "send.err.phone" };
  const { count } = await prisma.dispatcher.updateMany({ where: { id: input.dispatcherId, agentId: s.agentId }, data: { phone } });
  if (count === 0) return { ok: false, error: "error.notFound" };
  return { ok: true, data: { phone } };
}

/** Sets vehicle and FT/PT from a month on, for one dispatcher or many. Replaces a change already made for that month. */
export async function setProfiles(input: z.input<typeof profileInput>): Promise<ActionResult<{ count: number }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "error.invalid" };
  const { effectiveFrom, vehicle, employment } = parsed.data;
  const ids = [...new Set(parsed.data.dispatcherIds)];
  const owned = await prisma.dispatcher.findMany({
    where: { id: { in: ids }, agentId: s.agentId },
    // What each one had in that month before this change, for the change log.
    select: { id: true, name: true, profiles: { where: { effectiveFrom: { lte: effectiveFrom } }, orderBy: { effectiveFrom: "desc" }, take: 1 } },
  });
  if (owned.length !== ids.length) return { ok: false, error: "error.notFound" };
  await prisma.$transaction([
    prisma.dispatcherProfile.deleteMany({ where: { dispatcherId: { in: ids }, effectiveFrom } }),
    prisma.dispatcherProfile.createMany({ data: ids.map((dispatcherId) => ({ dispatcherId, effectiveFrom, vehicle, employment })) }),
    prisma.ruleAudit.createMany({
      // Dispatchers who already had this vehicle and type aren't a change, so they stay out of the log.
      data: owned.filter((d) => d.profiles[0]?.vehicle !== vehicle || d.profiles[0]?.employment !== employment).map((d) => {
        const before = d.profiles[0];
        return {
          agentId: s.agentId,
          actor: s.actor,
          action: "profile",
          detail: {
            dispatcherId: d.id,
            dispatcher: d.name,
            month: effectiveFrom,
            vehicle,
            employment,
            from: before ? { vehicle: before.vehicle, employment: before.employment } : null,
          },
        };
      }),
    }),
  ]);
  revalidatePath("/app/dispatchers", "layout");
  return { ok: true, data: { count: ids.length } };
}

/** Confirms a change from last month's vehicle/type is right for this month's pay. Pay doesn't change, so drafts stay fresh. */
export async function confirmProfile(input: { profileId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const { count } = await prisma.dispatcherProfile.updateMany({
    where: { id: input.profileId, dispatcher: { agentId: s.agentId } },
    data: { confirmedAt: new Date() },
  });
  if (count === 0) return { ok: false, error: "error.notFound" };
  revalidatePath("/app/payroll", "layout");
  return { ok: true, data: undefined };
}

export async function deleteProfile(input: { profileId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const profile = await prisma.dispatcherProfile.findFirst({
    where: { id: input.profileId, dispatcher: { agentId: s.agentId } },
    select: { id: true, dispatcherId: true, effectiveFrom: true, vehicle: true, employment: true, dispatcher: { select: { name: true } } },
  });
  if (!profile) return { ok: false, error: "error.notFound" };
  await prisma.$transaction([
    prisma.dispatcherProfile.delete({ where: { id: profile.id } }),
    prisma.ruleAudit.create({
      data: {
        agentId: s.agentId,
        actor: s.actor,
        action: "profileDelete",
        detail: { dispatcherId: profile.dispatcherId, dispatcher: profile.dispatcher.name, month: profile.effectiveFrom, vehicle: profile.vehicle, employment: profile.employment },
      },
    }),
  ]);
  revalidatePath("/app/dispatchers", "layout");
  return { ok: true, data: undefined };
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v));

async function mergeSide(agentId: string, id: string) {
  return prisma.dispatcher.findFirst({
    where: { id, agentId },
    select: {
      id: true,
      name: true,
      phone: true,
      assignments: { select: { extId: true, branch: { select: { code: true } } } },
      profiles: { select: { id: true, effectiveFrom: true } },
      salaryRecords: { select: { uploadId: true } },
      payrollResults: { select: { id: true, runId: true, parcels: true, run: { select: { status: true, period: true, branch: { select: { code: true } } } } } },
    },
  });
}

/**
 * One person with two J&T IDs (moved branch, or got a new ID): `mergeId`'s IDs, pay history, vehicle and type,
 * advances, penalty cases and own rules move to `keepId`, and `mergeId` goes. Finalised payslips keep the
 * name and ID they were paid under. Refused when both were paid in the same finalised run.
 */
export async function mergeDispatchers(input: { keepId: string; mergeId: string }): Promise<ActionResult<{ recalculated: number }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  if (input.keepId === input.mergeId) return { ok: false, error: "error.invalid" };
  const [keep, drop] = await Promise.all([mergeSide(s.agentId, input.keepId), mergeSide(s.agentId, input.mergeId)]);
  if (!keep || !drop) return { ok: false, error: "error.notFound" };

  const side = (d: NonNullable<typeof keep>) =>
    d.payrollResults.map((r) => ({ id: r.id, runId: r.runId, final: r.run.status === "FINAL", label: `${r.run.branch.code} · ${r.run.period}`, parcels: r.parcels as unknown as Parcels }));
  const plan = planMerge(side(keep), side(drop));
  if (plan.blocked.length) return { ok: false, error: "merge.err.final", vars: { runs: plan.blocked.join(", ") } };
  // v1 pay records (from before the account moved to v2) are one per upload too.
  const uploads = new Set(keep.salaryRecords.map((r) => r.uploadId));
  if (drop.salaryRecords.some((r) => uploads.has(r.uploadId))) return { ok: false, error: "merge.err.v1" };

  const from = { dispatcherId: drop.id };
  const to = { dispatcherId: keep.id };
  await prisma.$transaction(
    [
      prisma.dispatcherAssignment.updateMany({ where: from, data: to }),
      prisma.payrollResult.updateMany({ where: { id: { in: plan.move } }, data: to }),
      ...plan.combine.flatMap((c) => [prisma.payrollResult.delete({ where: { id: c.dropId } }), prisma.payrollResult.update({ where: { id: c.keepId }, data: { parcels: json(c.parcels) } })]),
      prisma.dispatcherProfile.updateMany({ where: { id: { in: profilesToMove(keep.profiles, drop.profiles) } }, data: to }),
      prisma.advance.updateMany({ where: from, data: to }),
      prisma.penaltyItem.updateMany({ where: from, data: to }),
      prisma.penaltyAlias.updateMany({ where: from, data: to }),
      prisma.payRuleAssignment.updateMany({ where: from, data: to }),
      prisma.salaryRecord.updateMany({ where: from, data: to }),
      prisma.employee.updateMany({ where: from, data: to }),
      prisma.dispatcher.update({ where: { id: keep.id }, data: { phone: keep.phone ?? drop.phone } }),
      prisma.dispatcher.delete({ where: { id: drop.id } }),
      prisma.ruleAudit.create({
        data: {
          agentId: s.agentId,
          actor: s.actor,
          action: "merge",
          detail: { dispatcherId: keep.id, dispatcher: keep.name, merged: drop.name, ids: drop.assignments.map((a) => `${a.branch.code} ${a.extId}`).join(", ") },
        },
      }),
    ],
  );
  // Runs that now hold the person's parcels from both IDs; other drafts went stale and recalculate when opened.
  for (const c of plan.combine) await calculateRun(s.agentId, c.runId);
  revalidatePath("/app", "layout");
  return { ok: true, data: { recalculated: plan.combine.length } };
}
