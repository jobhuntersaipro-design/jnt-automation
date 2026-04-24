import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { runPrewarmFinalize } from "@/lib/staff/prewarm";

// 10 minutes — finalize only reads per-record R2 blobs and re-streams them
// into two ZIPs, so it's always fast in practice, but the cap matches the
// legacy inline prewarm route.
export const maxDuration = 600;

async function handler(req: Request) {
  const payload = (await req.json()) as {
    agentId?: string;
    year?: number;
    month?: number;
  };
  if (!payload?.agentId || !payload.year || !payload.month) {
    return new Response("Missing agentId / year / month", { status: 400 });
  }
  try {
    await runPrewarmFinalize({
      agentId: payload.agentId,
      year: payload.year,
      month: payload.month,
    });
    return new Response("ok");
  } catch (err) {
    console.error(
      `[/payroll-cache/prewarm/worker/finalize] ${payload.agentId} ${payload.year}-${payload.month}:`,
      err,
    );
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
