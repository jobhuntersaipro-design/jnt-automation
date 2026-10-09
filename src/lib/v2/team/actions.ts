"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendTeamInviteEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { v2Owner, type ActionResult } from "@/lib/v2/session";

// The owner's team: branch supervisors who sign in as themselves and prepare payroll for their branches.
// Each is an Agent row with `ownerId` set (their own login, password and sessions); see getV2Agent.

const INVITE_DAYS = 7;
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const member = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  branchIds: z.array(z.string().min(1)).min(1).max(200),
});

/** The account's own (non-sample) branches among `ids`, or null when any isn't. */
async function ownBranches(agentId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = await prisma.branch.findMany({ where: { agentId, isDemo: false, id: { in: unique } }, select: { id: true, code: true }, orderBy: { code: "asc" } });
  return rows.length === unique.length ? rows : null;
}

/** A new set-password link for the member (any older one stops working), emailed when email is set up. */
async function invite(m: { email: string; name: string; branches: string[] }, owner: string): Promise<{ link: string; emailed: boolean }> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: m.email } }),
    prisma.verificationToken.create({ data: { identifier: m.email, token: hash(token), expires: new Date(Date.now() + INVITE_DAYS * 86_400_000) } }),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const link = `${origin}/app/join?${new URLSearchParams({ email: m.email, token })}`;
  const emailed = await sendTeamInviteEmail({ ...m, owner, url: link }).then(
    () => true,
    (e) => {
      console.error("[team] invite email failed", e);
      return false;
    },
  );
  return { link, emailed };
}

export async function inviteMember(input: z.input<typeof member>): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const s = await v2Owner();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = member.safeParse(input);
  if (!parsed.success) return { ok: false, error: "team.err.invalid" };
  const { name, email } = parsed.data;
  const branches = await ownBranches(s.agentId, parsed.data.branchIds);
  if (!branches) return { ok: false, error: "error.notFound" };
  // One login per email across EasyStaff: an existing account (anyone's) can't also be a team member.
  if (await prisma.agent.findUnique({ where: { email }, select: { id: true } })) return { ok: false, error: "team.err.exists" };
  const owner = await prisma.agent.findUniqueOrThrow({ where: { id: s.agentId }, select: { name: true } });
  await prisma.$transaction([
    prisma.agent.create({
      // Approved, on v2 and past the tour, so first sign-in seeds no sample data and lands in the owner's account.
      data: { email, name, isApproved: true, uiVersion: "V2", hasSeenTutorial: true, ownerId: s.agentId, teamBranchIds: branches.map((b) => b.id) },
    }),
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "teamInvite", detail: { name, email, branches: branches.map((b) => b.code).join(", ") } } }),
  ]);
  revalidatePath("/app/settings");
  return { ok: true, data: await invite({ email, name, branches: branches.map((b) => b.code) }, owner.name) };
}

async function ownMember(agentId: string, id: string) {
  return prisma.agent.findFirst({ where: { id, ownerId: agentId }, select: { id: true, email: true, name: true, password: true, teamBranchIds: true } });
}

/** A fresh set-password link for someone who hasn't set one yet (the old link stops working). */
export async function resendInvite(input: { id: string }): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const s = await v2Owner();
  if (!s) return { ok: false, error: "error.forbidden" };
  const m = await ownMember(s.agentId, input.id);
  if (!m) return { ok: false, error: "error.notFound" };
  if (m.password) return { ok: false, error: "team.err.joined" };
  const [owner, branches] = await Promise.all([
    prisma.agent.findUniqueOrThrow({ where: { id: s.agentId }, select: { name: true } }),
    prisma.branch.findMany({ where: { id: { in: m.teamBranchIds } }, select: { code: true }, orderBy: { code: "asc" } }),
  ]);
  return { ok: true, data: await invite({ email: m.email, name: m.name, branches: branches.map((b) => b.code) }, owner.name) };
}

export async function setMemberBranches(input: { id: string; branchIds: string[] }): Promise<ActionResult> {
  const s = await v2Owner();
  if (!s) return { ok: false, error: "error.forbidden" };
  const m = await ownMember(s.agentId, input.id);
  if (!m) return { ok: false, error: "error.notFound" };
  if (input.branchIds.length === 0) return { ok: false, error: "team.err.invalid" };
  const branches = await ownBranches(s.agentId, input.branchIds);
  if (!branches) return { ok: false, error: "error.notFound" };
  await prisma.$transaction([
    prisma.agent.update({ where: { id: m.id }, data: { teamBranchIds: branches.map((b) => b.id) } }),
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "teamBranches", detail: { name: m.name, email: m.email, branches: branches.map((b) => b.code).join(", ") } } }),
  ]);
  revalidatePath("/app/settings");
  return { ok: true, data: undefined };
}

/** Removes a member's login. What they did stays in the logs under their email. */
export async function removeMember(input: { id: string }): Promise<ActionResult> {
  const s = await v2Owner();
  if (!s) return { ok: false, error: "error.forbidden" };
  const m = await ownMember(s.agentId, input.id);
  if (!m) return { ok: false, error: "error.notFound" };
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: m.email } }),
    prisma.agent.delete({ where: { id: m.id } }),
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "teamRemove", detail: { name: m.name, email: m.email } } }),
  ]);
  revalidatePath("/app/settings");
  return { ok: true, data: undefined };
}

/** The invite link's page: sets the member's password (signed out). The page then signs them in. */
export async function acceptInvite(input: { email: string; token: string; password: string }): Promise<ActionResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (password.length < 8 || password.length > 128) return { ok: false, error: "settings.err.passwordLength" };
  const row = await prisma.verificationToken.findUnique({ where: { token: hash(String(input.token ?? "")) } });
  if (!row || row.identifier !== email || row.expires < new Date()) return { ok: false, error: "team.err.link" };
  const m = await prisma.agent.findUnique({ where: { email }, select: { id: true, ownerId: true } });
  if (!m?.ownerId) return { ok: false, error: "team.err.link" };
  await prisma.$transaction([
    prisma.verificationToken.delete({ where: { token: row.token } }),
    prisma.agent.update({ where: { id: m.id }, data: { password: await bcrypt.hash(password, 12) } }),
  ]);
  return { ok: true, data: undefined };
}
