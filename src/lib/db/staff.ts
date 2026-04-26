import { prisma } from "@/lib/prisma";
import type { Gender } from "@/generated/prisma/client";

export type StaffAssignment = {
  branchCode: string;
  extId: string;
};

export type StaffDispatcher = {
  id: string;
  /** Primary / most-recent assignment extId (for single-branch display contexts) */
  extId: string;
  name: string;
  icNo: string;
  gender: Gender;
  avatarUrl: string | null;
  isPinned: boolean;
  /** Primary / most-recent assignment branch code */
  branchCode: string;
  /** All branch assignments, ordered most recent first */
  assignments: StaffAssignment[];
  isComplete: boolean;
  /** "NEW" if no salary records or first seen this month, otherwise "Jan 2026" */
  firstSeen: string;
  /** Full IC (unmasked) for the drawer */
  rawIcNo: string;
  weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  bonusTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  incentiveRule: { orderThreshold: number } | null;
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number } | null;
};

export async function getDispatchers(
  agentId: string,
  filters: { branchCodes?: string[]; search?: string },
): Promise<StaffDispatcher[]> {
  const { branchCodes = [], search } = filters;

  const [dispatchers, latestRecord] = await Promise.all([
    prisma.dispatcher.findMany({
      where: {
        // A dispatcher is owned directly by the agent (post-Phase-B agentId)
        // or, as a safety net, via their canonical branch. The `agentId` field
        // is authoritative.
        agentId,
        // Filter matches if the person has an assignment at any of the
        // selected branches — a transfer-aware lookup.
        ...(branchCodes.length > 0 && {
          assignments: {
            some: { branch: { code: { in: branchCodes } } },
          },
        }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            {
              assignments: {
                some: { extId: { contains: search, mode: "insensitive" as const } },
              },
            },
          ],
        }),
      },
      include: {
        assignments: {
          include: { branch: { select: { code: true } } },
          orderBy: { startedAt: "desc" },
        },
        weightTiers: {
          select: { tier: true, minWeight: true, maxWeight: true, commission: true },
          orderBy: { tier: "asc" as const },
        },
        incentiveRule: { select: { orderThreshold: true } },
        bonusTiers: {
          select: { tier: true, minWeight: true, maxWeight: true, commission: true },
          orderBy: { tier: "asc" as const },
        },
        petrolRule: { select: { isEligible: true, dailyThreshold: true, subsidyAmount: true } },
        salaryRecords: {
          select: { month: true, year: true },
          orderBy: [{ year: "asc" }, { month: "asc" }],
          take: 1,
        },
      },
      orderBy: [{ isPinned: "desc" }, { name: "asc" }],
    }),
    prisma.salaryRecord.findFirst({
      where: { dispatcher: { agentId } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { month: true, year: true },
    }),
  ]);

  // Determine the latest uploaded month to know what counts as "NEW"
  let latestMonth = latestRecord?.month ?? 0;
  let latestYear = latestRecord?.year ?? 0;
  for (const d of dispatchers) {
    for (const sr of d.salaryRecords) {
      if (sr.year > latestYear || (sr.year === latestYear && sr.month > latestMonth)) {
        latestYear = sr.year;
        latestMonth = sr.month;
      }
    }
  }

  return dispatchers.map((d) => {
    const earliest = d.salaryRecords[0];
    let firstSeen: string;
    if (!earliest) {
      firstSeen = "NEW";
    } else if (earliest.year === latestYear && earliest.month === latestMonth) {
      firstSeen = "NEW";
    } else {
      firstSeen = `${MONTH_ABBR[earliest.month - 1]} ${earliest.year}`;
    }

    const assignments: StaffAssignment[] = d.assignments.map((a) => ({
      branchCode: a.branch.code,
      extId: a.extId,
    }));
    // Fall back to the denormalized Dispatcher.branchId/extId if — for any
    // reason — the person has no assignments yet (e.g., mid-migration, or
    // legacy rows created before Phase B). Phase-B backfilled all rows, but
    // being defensive prevents the list from rendering empty chips.
    const primaryBranchCode = assignments[0]?.branchCode ?? "";
    const primaryExtId = assignments[0]?.extId ?? d.extId;

    return {
      id: d.id,
      extId: primaryExtId,
      name: d.name,
      icNo: d.icNo ?? "",
      gender: d.gender,
      avatarUrl: d.avatarUrl,
      isPinned: d.isPinned,
      branchCode: primaryBranchCode,
      assignments,
      isComplete: computeIsComplete(d.name, d.icNo, primaryExtId),
      firstSeen,
      rawIcNo: d.icNo ?? "",
      weightTiers: d.weightTiers,
      bonusTiers: d.bonusTiers,
      incentiveRule: d.incentiveRule,
      petrolRule: d.petrolRule,
    };
  });
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Fetch a single dispatcher in the same shape `getDispatchers` returns, scoped
 * by agent. Used by the salary-table slide-in modal — `DispatcherDrawer` needs
 * the full `StaffDispatcher` (assignments, tiers, rules, firstSeen, …) and the
 * salary-table rows only carry an id + name. agentId scope is enforced both on
 * the Dispatcher row and as a defensive filter on the latest-record probe.
 */
export async function getStaffDispatcherById(
  agentId: string,
  dispatcherId: string,
): Promise<StaffDispatcher | null> {
  const [d, latestRecord] = await Promise.all([
    prisma.dispatcher.findFirst({
      where: { id: dispatcherId, agentId },
      include: {
        assignments: {
          include: { branch: { select: { code: true } } },
          orderBy: { startedAt: "desc" },
        },
        weightTiers: {
          select: { tier: true, minWeight: true, maxWeight: true, commission: true },
          orderBy: { tier: "asc" as const },
        },
        incentiveRule: { select: { orderThreshold: true } },
        bonusTiers: {
          select: { tier: true, minWeight: true, maxWeight: true, commission: true },
          orderBy: { tier: "asc" as const },
        },
        petrolRule: { select: { isEligible: true, dailyThreshold: true, subsidyAmount: true } },
        salaryRecords: {
          select: { month: true, year: true },
          orderBy: [{ year: "asc" }, { month: "asc" }],
          take: 1,
        },
      },
    }),
    prisma.salaryRecord.findFirst({
      where: { dispatcher: { agentId } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { month: true, year: true },
    }),
  ]);

  if (!d) return null;

  let latestMonth = latestRecord?.month ?? 0;
  let latestYear = latestRecord?.year ?? 0;
  for (const sr of d.salaryRecords) {
    if (sr.year > latestYear || (sr.year === latestYear && sr.month > latestMonth)) {
      latestYear = sr.year;
      latestMonth = sr.month;
    }
  }

  const earliest = d.salaryRecords[0];
  let firstSeen: string;
  if (!earliest) {
    firstSeen = "NEW";
  } else if (earliest.year === latestYear && earliest.month === latestMonth) {
    firstSeen = "NEW";
  } else {
    firstSeen = `${MONTH_ABBR[earliest.month - 1]} ${earliest.year}`;
  }

  const assignments: StaffAssignment[] = d.assignments.map((a) => ({
    branchCode: a.branch.code,
    extId: a.extId,
  }));
  const primaryBranchCode = assignments[0]?.branchCode ?? "";
  const primaryExtId = assignments[0]?.extId ?? d.extId;

  return {
    id: d.id,
    extId: primaryExtId,
    name: d.name,
    icNo: d.icNo ?? "",
    gender: d.gender,
    avatarUrl: d.avatarUrl,
    isPinned: d.isPinned,
    branchCode: primaryBranchCode,
    assignments,
    isComplete: computeIsComplete(d.name, d.icNo, primaryExtId),
    firstSeen,
    rawIcNo: d.icNo ?? "",
    weightTiers: d.weightTiers,
    bonusTiers: d.bonusTiers,
    incentiveRule: d.incentiveRule,
    petrolRule: d.petrolRule,
  };
}

export type DispatcherDetail = {
  id: string;
  extId: string;
  name: string;
  icNo: string;
  gender: Gender;
  branchCode: string;
  isPinned: boolean;
  isComplete: boolean;
  weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  bonusTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  incentiveRule: { orderThreshold: number } | null;
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number } | null;
};

export async function getDispatcherById(
  agentId: string,
  dispatcherId: string,
): Promise<DispatcherDetail | null> {
  const d = await prisma.dispatcher.findFirst({
    where: { id: dispatcherId, branch: { agentId } },
    include: {
      branch: { select: { code: true } },
      weightTiers: {
        select: { tier: true, minWeight: true, maxWeight: true, commission: true },
        orderBy: { tier: "asc" },
      },
      incentiveRule: {
        select: { orderThreshold: true },
      },
      bonusTiers: {
        select: { tier: true, minWeight: true, maxWeight: true, commission: true },
        orderBy: { tier: "asc" },
      },
      petrolRule: {
        select: { isEligible: true, dailyThreshold: true, subsidyAmount: true },
      },
    },
  });

  if (!d) return null;

  return {
    id: d.id,
    extId: d.extId,
    name: d.name,
    icNo: d.icNo ?? "",
    gender: d.gender,
    branchCode: d.branch.code,
    isPinned: d.isPinned,
    isComplete: computeIsComplete(d.name, d.icNo, d.extId),
    weightTiers: d.weightTiers,
    bonusTiers: d.bonusTiers,
    incentiveRule: d.incentiveRule,
    petrolRule: d.petrolRule,
  };
}

export type AgentDefaults = {
  weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  bonusTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  incentiveRule: { orderThreshold: number };
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number };
};

const FALLBACK_DEFAULTS: AgentDefaults = {
  weightTiers: [
    { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
    { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
    { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
  ],
  bonusTiers: [
    { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
    { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
    { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
  ],
  incentiveRule: { orderThreshold: 2000 },
  petrolRule: { isEligible: true, dailyThreshold: 70, subsidyAmount: 15 },
};

type AgentDefaultRow = {
  tier1MinWeight: number; tier1MaxWeight: number; tier1Commission: number;
  tier2MinWeight: number; tier2MaxWeight: number; tier2Commission: number;
  tier3MinWeight: number; tier3Commission: number;
  orderThreshold: number;
  bonusTier1Commission: number; bonusTier2Commission: number; bonusTier3Commission: number;
  petrolEligible: boolean; dailyThreshold: number; subsidyAmount: number;
};

/**
 * Hard-coded fallback as a row-shaped object so per-field aggregation can
 * borrow individual values from it when the DB has no agent-fallback row.
 * Mirrors FALLBACK_DEFAULTS verbatim — keep them in sync.
 */
const FALLBACK_ROW: AgentDefaultRow = {
  tier1MinWeight: 0,
  tier1MaxWeight: 5,
  tier1Commission: 1.0,
  tier2MinWeight: 5.01,
  tier2MaxWeight: 10,
  tier2Commission: 1.4,
  tier3MinWeight: 10.01,
  tier3Commission: 2.2,
  orderThreshold: 2000,
  bonusTier1Commission: 1.5,
  bonusTier2Commission: 2.1,
  bonusTier3Commission: 3.3,
  petrolEligible: true,
  dailyThreshold: 70,
  subsidyAmount: 15,
};

function rowToDefaults(d: AgentDefaultRow): AgentDefaults {
  return {
    weightTiers: [
      { tier: 1, minWeight: d.tier1MinWeight, maxWeight: d.tier1MaxWeight, commission: d.tier1Commission },
      { tier: 2, minWeight: d.tier2MinWeight, maxWeight: d.tier2MaxWeight, commission: d.tier2Commission },
      { tier: 3, minWeight: d.tier3MinWeight, maxWeight: null, commission: d.tier3Commission },
    ],
    bonusTiers: [
      { tier: 1, minWeight: d.tier1MinWeight, maxWeight: d.tier1MaxWeight, commission: d.bonusTier1Commission },
      { tier: 2, minWeight: d.tier2MinWeight, maxWeight: d.tier2MaxWeight, commission: d.bonusTier2Commission },
      { tier: 3, minWeight: d.tier3MinWeight, maxWeight: null, commission: d.bonusTier3Commission },
    ],
    incentiveRule: { orderThreshold: d.orderThreshold },
    petrolRule: { isEligible: d.petrolEligible, dailyThreshold: d.dailyThreshold, subsidyAmount: d.subsidyAmount },
  };
}

const COMPARED_FIELDS: Array<keyof AgentDefaultRow> = [
  "tier1MinWeight", "tier1MaxWeight", "tier1Commission",
  "tier2MinWeight", "tier2MaxWeight", "tier2Commission",
  "tier3MinWeight", "tier3Commission",
  "orderThreshold",
  "bonusTier1Commission", "bonusTier2Commission", "bonusTier3Commission",
  "petrolEligible", "dailyThreshold", "subsidyAmount",
];


/**
 * Resolve the defaults for a given (agent, branch) pair.
 *
 *   1. branchId given → branch-specific override → fall through to (2).
 *   2. No branchId / no override → PER-FIELD AGGREGATE for the
 *      "All branches" view:
 *        - For each field, compute every branch's effective value
 *          (its override row, or the agent fallback if no override).
 *        - If all branches' values agree on that field, surface it.
 *        - Otherwise surface the fallback row's value for that field.
 *      This way the drawer can show e.g. orderThreshold=3000 (all
 *      branches agree) even if tier1Commission diverges between branches
 *      (which keeps the agent fallback's tier1Commission). Replaces the
 *      old row-level "all fields must match or fall back entirely"
 *      heuristic that was too coarse to be useful.
 */
export async function getAgentDefaults(
  agentId: string,
  branchId?: string | null,
): Promise<AgentDefaults> {
  // Branch-specific lookup — direct hit on the override row.
  if (branchId) {
    const d = await prisma.agentDefault.findUnique({
      where: { agentId_branchId: { agentId, branchId } },
    });
    if (d) return rowToDefaults(d);
    // Fall through to the same all-branches resolution below.
  }

  const [branches, fallbackRow] = await Promise.all([
    prisma.branch.findMany({
      where: { agentId },
      select: { id: true, code: true },
    }),
    prisma.agentDefault.findFirst({ where: { agentId, branchId: null } }),
  ]);

  // No branches yet → just use the literal fallback row (or constants).
  if (branches.length === 0) {
    return fallbackRow ? rowToDefaults(fallbackRow) : FALLBACK_DEFAULTS;
  }

  const overrides = await prisma.agentDefault.findMany({
    where: { agentId, branchId: { in: branches.map((b) => b.id) } },
  });
  const overrideByBranchId = new Map<string, AgentDefaultRow>();
  for (const o of overrides) {
    if (o.branchId) overrideByBranchId.set(o.branchId, o);
  }
  // Borrow individual values from this row when the field doesn't
  // unanimously agree across branches.
  const baseRow: AgentDefaultRow = fallbackRow ?? FALLBACK_ROW;

  // Per-field aggregate. Each branch's "effective" value is its override
  // (if any) or the fallback row. If all branches share the same effective
  // value for a field, that value wins; otherwise the field stays on the
  // base fallback.
  const aggregated: Record<string, unknown> = { ...baseRow };
  const agreed: string[] = [];
  const diverged: string[] = [];
  for (const field of COMPARED_FIELDS) {
    const valuesPerBranch = branches.map((b) => {
      const o = overrideByBranchId.get(b.id);
      return o ? (o as Record<string, unknown>)[field] : (baseRow as Record<string, unknown>)[field];
    });
    const first = valuesPerBranch[0];
    const allSame = valuesPerBranch.every((v) => v === first);
    if (allSame) {
      aggregated[field] = first;
      agreed.push(field);
    } else {
      diverged.push(field);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const codeById = new Map(branches.map((b) => [b.id, b.code]));
    const summary = overrides.map((o) => ({
      branch: codeById.get(o.branchId ?? "") ?? o.branchId,
      orderThreshold: o.orderThreshold,
    }));
    console.log(
      `[defaults-aggregate] agent=${agentId.slice(0, 8)} branches=${branches.length} overrides=${overrides.length} rows=`,
      summary,
    );
    console.log(
      `[defaults-aggregate] per-field: ${agreed.length} agreed, ${diverged.length} diverged`,
      diverged.length > 0 ? `(diverged: ${diverged.join(", ")} — using fallback for these)` : "",
    );
  }

  return rowToDefaults(aggregated as unknown as AgentDefaultRow);
}

export function computeIsComplete(
  name: string,
  _icNo: string | null,
  extId: string,
): boolean {
  return name.length > 0 && extId.length > 0;
}

export function maskIc(ic: string | null): string {
  if (!ic) return "";
  if (ic.length <= 4) return ic;
  return "\u2022".repeat(ic.length - 4) + ic.slice(-4);
}

/**
 * Load full parcel-level detail for a single SalaryRecord, scoped to
 * `agentId`. Returns null if the record doesn't exist or belongs to a
 * different tenant — the caller should redirect rather than leak
 * existence via a 404.
 */
export async function getMonthDetail(salaryRecordId: string, agentId: string) {
  const record = await prisma.salaryRecord.findFirst({
    where: {
      id: salaryRecordId,
      dispatcher: { branch: { agentId } },
    },
    include: {
      dispatcher: {
        select: {
          id: true,
          name: true,
          extId: true,
          avatarUrl: true,
          icNo: true,
          branch: { select: { code: true } },
        },
      },
      lineItems: {
        select: {
          deliveryDate: true,
          waybillNumber: true,
          weight: true,
          commission: true,
          isBonusTier: true,
        },
        orderBy: [{ deliveryDate: "asc" }, { weight: "asc" }],
      },
    },
  });

  if (!record) return null;

  return {
    salaryRecordId: record.id,
    dispatcher: {
      id: record.dispatcher.id,
      name: record.dispatcher.name,
      extId: record.dispatcher.extId,
      avatarUrl: record.dispatcher.avatarUrl,
      icNo: record.dispatcher.icNo,
      branchCode: record.dispatcher.branch.code,
    },
    month: record.month,
    year: record.year,
    totals: {
      totalOrders: record.totalOrders,
      totalWeight: record.lineItems.reduce((s, li) => s + li.weight, 0),
      baseSalary: record.baseSalary,
      bonusTierEarnings: record.bonusTierEarnings,
      netSalary: record.netSalary,
    },
    weightTiersSnapshot: record.weightTiersSnapshot,
    bonusTierSnapshot: record.bonusTierSnapshot,
    lineItems: record.lineItems.map((li) => ({
      deliveryDate: li.deliveryDate,
      waybillNumber: li.waybillNumber,
      weight: li.weight,
      commission: li.commission,
      isBonusTier: li.isBonusTier,
    })),
  };
}

export type MonthDetail = NonNullable<Awaited<ReturnType<typeof getMonthDetail>>>;

/**
 * Retry transient Neon serverless auth/handshake timeouts. Neon's compute
 * can drop the connection between bursts of activity; the next query then
 * needs to re-auth and occasionally fails the first attempt with a timeout.
 */
async function withNeonRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 400,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        /authentication timed out|ETIMEDOUT|ECONNRESET|terminating connection|connection terminated/i.test(
          msg,
        );
      if (!transient || i === attempts - 1) throw err;
      await new Promise((r) =>
        setTimeout(r, baseDelayMs * Math.pow(2, i)),
      );
    }
  }
  throw lastErr;
}

/**
 * Batch-fetch every dispatcher's parcel-level detail for a given month in
 * a single DB round-trip (2 queries thanks to Prisma's include). Much
 * faster than calling getMonthDetail N times.
 *
 * Optional `dispatcherIds` narrows the result to a specific subset — used
 * by the QStash fan-out worker (Phase 3b) where each chunk processes a
 * slice of the month's dispatchers.
 */
export async function getMonthDetailsBatch(
  agentId: string,
  year: number,
  month: number,
  dispatcherIds?: string[],
) {
  const records = await withNeonRetry(() =>
    prisma.salaryRecord.findMany({
      where: {
        year,
        month,
        dispatcher: { branch: { agentId } },
        ...(dispatcherIds && dispatcherIds.length > 0
          ? { dispatcherId: { in: dispatcherIds } }
          : {}),
      },
      include: {
        dispatcher: {
          select: {
            id: true,
            name: true,
            extId: true,
            avatarUrl: true,
            icNo: true,
            branch: { select: { code: true } },
          },
        },
        lineItems: {
          select: {
            deliveryDate: true,
            waybillNumber: true,
            weight: true,
            commission: true,
            isBonusTier: true,
          },
          orderBy: [{ deliveryDate: "asc" }, { weight: "asc" }],
        },
      },
      orderBy: { dispatcher: { name: "asc" } },
    }),
  );

  return records.map((r) => ({
    salaryRecordId: r.id,
    dispatcher: {
      id: r.dispatcher.id,
      name: r.dispatcher.name,
      extId: r.dispatcher.extId,
      avatarUrl: r.dispatcher.avatarUrl,
      icNo: r.dispatcher.icNo,
      branchCode: r.dispatcher.branch.code,
    },
    month: r.month,
    year: r.year,
    totals: {
      totalOrders: r.totalOrders,
      totalWeight: r.lineItems.reduce((s, li) => s + li.weight, 0),
      baseSalary: r.baseSalary,
      bonusTierEarnings: r.bonusTierEarnings,
      netSalary: r.netSalary,
    },
    weightTiersSnapshot: r.weightTiersSnapshot,
    bonusTierSnapshot: r.bonusTierSnapshot,
    lineItems: r.lineItems.map((li) => ({
      deliveryDate: li.deliveryDate,
      waybillNumber: li.waybillNumber,
      weight: li.weight,
      commission: li.commission,
      isBonusTier: li.isBonusTier,
    })),
  }));
}
