import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { defaultsBodySchema } from "@/lib/validations/staff";
import { getAgentDefaults } from "@/lib/db/staff";

/**
 * Resolve a branchCode (or its absence) to a concrete branchId scoped to
 * the agent. Returns:
 *   - { ok: true, branchId: string }  — branch matched
 *   - { ok: true, branchId: null }    — caller wants the agent-level fallback
 *   - { ok: false }                    — branchCode given but doesn't belong
 *                                        to this agent
 */
async function resolveBranch(
  agentId: string,
  branchCode: string | null,
): Promise<{ ok: true; branchId: string | null } | { ok: false }> {
  if (!branchCode) return { ok: true, branchId: null };
  const branch = await prisma.branch.findFirst({
    where: { agentId, code: branchCode },
    select: { id: true },
  });
  if (!branch) return { ok: false };
  return { ok: true, branchId: branch.id };
}

/**
 * GET /api/staff/defaults?branchCode=XYZ
 *
 * Returns the defaults a caller would resolve for that branch — branch
 * override if one exists, otherwise the agent-level fallback, otherwise
 * the hardcoded constants. Omitting branchCode returns the agent-level
 * fallback directly.
 */
export async function GET(req: NextRequest) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const branchCode = new URL(req.url).searchParams.get("branchCode");
    const resolved = await resolveBranch(agentId, branchCode);
    if (!resolved.ok) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    const defaults = await getAgentDefaults(agentId, resolved.branchId);
    return NextResponse.json(defaults);
  } catch (err) {
    console.error("[staff/defaults] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/staff/defaults?branchCode=XYZ
 *
 * Upserts the defaults row for the given (agent, branch). Omitting
 * branchCode writes to the agent-level fallback (branchId IS NULL).
 */
export async function PUT(req: NextRequest) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const branchCode = new URL(req.url).searchParams.get("branchCode");
    const resolved = await resolveBranch(agentId, branchCode);
    if (!resolved.ok) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    const branchId = resolved.branchId;

    const raw = await req.json();
    const parsed = defaultsBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { weightTiers, bonusTiers, incentiveRule, petrolRule } = parsed.data;

    const t1 = weightTiers.find((t) => t.tier === 1);
    const t2 = weightTiers.find((t) => t.tier === 2);
    const t3 = weightTiers.find((t) => t.tier === 3);

    if (!t1 || !t2 || !t3) {
      return NextResponse.json({ error: "All 3 weight tiers are required" }, { status: 400 });
    }

    const it1 = bonusTiers.find((t) => t.tier === 1);
    const it2 = bonusTiers.find((t) => t.tier === 2);
    const it3 = bonusTiers.find((t) => t.tier === 3);

    if (!it1 || !it2 || !it3) {
      return NextResponse.json({ error: "All 3 bonusTierEarnings tiers are required" }, { status: 400 });
    }

    const shared = {
      tier1MinWeight: t1.minWeight, tier1MaxWeight: t1.maxWeight ?? 5, tier1Commission: t1.commission,
      tier2MinWeight: t2.minWeight, tier2MaxWeight: t2.maxWeight ?? 10, tier2Commission: t2.commission,
      tier3MinWeight: t3.minWeight, tier3Commission: t3.commission,
      bonusTier1Commission: it1.commission,
      bonusTier2Commission: it2.commission,
      bonusTier3Commission: it3.commission,
      orderThreshold: incentiveRule.orderThreshold,
      petrolEligible: petrolRule.isEligible,
      dailyThreshold: petrolRule.dailyThreshold,
      subsidyAmount: petrolRule.subsidyAmount,
    };

    if (branchId) {
      // Branch-specific override — straightforward upsert on the composite key.
      await prisma.agentDefault.upsert({
        where: { agentId_branchId: { agentId, branchId } },
        create: { agentId, branchId, ...shared },
        update: shared,
      });
    } else {
      // Agent-level fallback — branchId = NULL. Postgres unique indexes treat
      // NULLs as distinct, so the composite unique on (agentId, branchId)
      // doesn't enforce a single fallback row. Find first, then update or
      // create — this works because the application always goes through
      // this path for the fallback (no other writer creates branchId=NULL
      // rows), so we never end up with concurrent fallback duplicates.
      const existing = await prisma.agentDefault.findFirst({
        where: { agentId, branchId: null },
        select: { id: true },
      });
      if (existing) {
        await prisma.agentDefault.update({ where: { id: existing.id }, data: shared });
      } else {
        await prisma.agentDefault.create({ data: { agentId, branchId: null, ...shared } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[staff/defaults] PUT error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
