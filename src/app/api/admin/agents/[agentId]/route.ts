import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { deleteAgent, getInvoiceAgent, toggleAgentApproval, updateAgentProfile } from "@/lib/db/admin";
import { normalizePhone } from "@/lib/billing";

const profileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200).optional(),
    phone: z.string().max(30).nullable().optional(),
    adminNotes: z.string().max(2000).nullable().optional(),
    maxBranches: z.number().int().min(1).max(1000).optional(),
    onlinePayment: z.boolean().optional(),
    uiVersion: z.enum(["V1", "V2"]).optional(),
    /** The v2 app's language until they pick one themselves; null = their browser's. */
    language: z.enum(["en", "zh"]).nullable().optional(),
  })
  .strict();

async function requireSuperAdmin() {
  const session = await auth();
  return session?.user?.id && session.user.isSuperAdmin ? session : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const session = await requireSuperAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;
  const body = await req.json().catch(() => null);

  if (body && typeof body.isApproved === "boolean") {
    const result = await toggleAgentApproval(agentId, body.isApproved);
    return NextResponse.json(result);
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: parsed.success ? "Nothing to update" : parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const data = { ...parsed.data };
  if (typeof data.phone === "string") {
    if (data.phone.trim() === "") {
      data.phone = null;
    } else {
      const phone = normalizePhone(data.phone);
      if (!phone) return NextResponse.json({ error: "Invalid WhatsApp number" }, { status: 400 });
      data.phone = phone;
    }
  }
  if (typeof data.adminNotes === "string") data.adminNotes = data.adminNotes.trim() || null;
  if (data.uiVersion) {
    // Superadmins stay on v1: /admin is a v1 page, so v2 would lock them out of it.
    const target = await getInvoiceAgent(agentId);
    if (!target) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    if (target.isSuperAdmin) return NextResponse.json({ error: "Superadmin accounts stay on v1" }, { status: 400 });
  }

  try {
    const result = await updateAgentProfile(agentId, data, {
      changedBy: "admin",
      actorEmail: session.user.email ?? null,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const session = await requireSuperAdmin();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;
  if (agentId === session.user.id) {
    return NextResponse.json({ error: "You can't delete your own account here" }, { status: 400 });
  }

  const agent = await getInvoiceAgent(agentId);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (agent.isSuperAdmin) {
    return NextResponse.json({ error: "Superadmin accounts can't be deleted" }, { status: 400 });
  }

  try {
    await deleteAgent(agentId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin] delete agent failed", agentId, err);
    return NextResponse.json({ error: "Couldn't delete this account. Please try again." }, { status: 500 });
  }
}
