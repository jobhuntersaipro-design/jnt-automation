"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { v2Owner, type ActionResult } from "@/lib/v2/session";
import { SLOTS } from "./journal";

const account = z.object({ code: z.string().trim().max(30), name: z.string().trim().max(100) });
const setup = z.object({
  accounts: z.object(Object.fromEntries(SLOTS.map((s) => [s, account])) as Record<(typeof SLOTS)[number], typeof account>),
  taxRate: z.string().trim().min(1).max(50),
  tracking: z.string().trim().max(50),
});

/** The account codes the payroll journal books to. Owner only: it's the company's books. */
export async function saveJournalSetup(input: z.input<typeof setup>): Promise<ActionResult> {
  const s = await v2Owner();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = setup.safeParse(input);
  if (!parsed.success) return { ok: false, error: "error.invalid" };
  const data = parsed.data;
  await prisma.journalSetup.upsert({ where: { agentId: s.agentId }, create: { agentId: s.agentId, ...data }, update: data });
  revalidatePath("/app/payroll/journal");
  return { ok: true, data: undefined };
}
