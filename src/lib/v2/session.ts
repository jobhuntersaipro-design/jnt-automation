import { auth } from "@/auth";
import { getV2Agent } from "@/lib/ui-version";
import type { MessageKey } from "@/lib/i18n/en";

/**
 * Who is acting in v2: the account whose data is read and written, and the email of the
 * person signed in (an admin's when viewing as the account) for the audit log.
 * Null for v1 accounts and signed-out visitors; v2 actions and routes must refuse then.
 */
export async function v2Session(): Promise<{ agentId: string; actor: string | null } | null> {
  const v2 = await getV2Agent();
  if (!v2) return null;
  const session = await auth();
  return { agentId: v2.agentId, actor: session?.user?.email ?? null };
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: MessageKey; vars?: Record<string, string | number> };
