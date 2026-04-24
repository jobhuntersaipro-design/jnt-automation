import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { runPrewarm, type PrewarmPayload } from "@/lib/staff/prewarm";

/**
 * POST /api/payroll-cache/prewarm
 *
 * QStash-signed worker. Idempotent — running it twice just overwrites
 * the same canonical cache keys with identical content.
 *
 * Budget: 10 minutes. Matches the finalize worker, which is the slowest
 * sibling (yauzl part-merge). Prewarm does a fresh end-to-end generation
 * and two ZIP uploads — comparable load.
 */
export const maxDuration = 600;

async function handler(req: Request) {
  const payload = (await req.json()) as PrewarmPayload;
  if (!payload?.agentId || !payload.year || !payload.month) {
    return new Response("Missing agentId / year / month", { status: 400 });
  }
  try {
    await runPrewarm(payload);
    return new Response("ok");
  } catch (err) {
    console.error(`[/payroll-cache/prewarm] ${payload.agentId}:`, err);
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
