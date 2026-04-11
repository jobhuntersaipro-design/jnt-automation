import { prisma } from "@/lib/prisma";
import type { ParsedRow } from "./parser";

export interface UnknownDispatcher {
  extId: string;
  name: string;
}

export interface DispatcherSplitResult {
  known: string[];
  unknown: UnknownDispatcher[];
}

/**
 * Split parsed delivery rows into known (existing in DB) vs unknown dispatcher IDs.
 */
export async function splitDispatchers(
  rows: ParsedRow[],
  agentId: string,
): Promise<DispatcherSplitResult> {
  const allExtIds = [...new Set(rows.map((r) => r.dispatcherId))];

  const existing = await prisma.dispatcher.findMany({
    where: {
      branch: { agentId },
      extId: { in: allExtIds },
    },
    select: { extId: true },
  });

  const knownIds = new Set(existing.map((d) => d.extId));

  return {
    known: allExtIds.filter((id) => knownIds.has(id)),
    unknown: allExtIds
      .filter((id) => !knownIds.has(id))
      .map((id) => ({
        extId: id,
        name:
          rows.find((r) => r.dispatcherId === id)?.dispatcherName ?? "Unknown",
      })),
  };
}
