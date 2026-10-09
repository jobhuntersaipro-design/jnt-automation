"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizePhone } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { EMPLOYMENTS, VEHICLES } from "@/lib/v2/pay/config";
import { isPeriod } from "@/lib/v2/pay/resolve";
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
