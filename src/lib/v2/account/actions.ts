"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getV2Agent } from "@/lib/ui-version";
import { v2Owner, type ActionResult } from "@/lib/v2/session";

// v2 account settings. Company details belong to the account being viewed (an admin viewing
// as a client can fill them in); the password belongs to whoever is signed in, so it's refused
// while viewing as someone else.

const company = z.object({
  name: z.string().trim().min(1).max(100),
  companyRegistrationNo: z.string().trim().max(50),
  companyAddress: z.string().trim().max(500),
});

export async function updateCompany(input: z.input<typeof company>): Promise<ActionResult> {
  const s = await v2Owner();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = company.safeParse(input);
  if (!parsed.success) return { ok: false, error: "settings.err.company" };
  const { name, companyRegistrationNo, companyAddress } = parsed.data;
  await prisma.agent.update({
    where: { id: s.agentId },
    data: { name, companyRegistrationNo: companyRegistrationNo || null, companyAddress: companyAddress || null },
  });
  revalidatePath("/app", "layout");
  return { ok: true, data: undefined };
}

export async function changePassword(input: { current: string; next: string }): Promise<ActionResult> {
  const v2 = await getV2Agent();
  if (!v2) return { ok: false, error: "error.forbidden" };
  if (v2.impersonating) return { ok: false, error: "error.forbidden" };
  const current = String(input.current ?? "");
  const next = String(input.next ?? "");
  if (next.length < 8 || next.length > 128) return { ok: false, error: "settings.err.passwordLength" };
  // A team member's own login, not the owner's account they work in.
  const id = v2.member?.id ?? v2.agentId;
  const agent = await prisma.agent.findUnique({ where: { id }, select: { password: true } });
  if (!agent?.password) return { ok: false, error: "settings.err.noPassword" };
  if (current.length > 128 || !(await bcrypt.compare(current, agent.password))) return { ok: false, error: "settings.err.wrongPassword" };
  await prisma.agent.update({ where: { id }, data: { password: await bcrypt.hash(next, 12) } });
  return { ok: true, data: undefined };
}
