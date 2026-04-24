import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { runPrewarmChunk, type PrewarmChunkPayload } from "@/lib/staff/prewarm";

// 5 minutes per chunk — matches the bulk-export chunk worker budget. A
// chunk of 15 dispatchers should finish in well under 2 min even for
// high-parcel months.
export const maxDuration = 300;

async function handler(req: Request) {
  const payload = (await req.json()) as PrewarmChunkPayload;
  if (
    !payload?.agentId ||
    !payload.year ||
    !payload.month ||
    !Array.isArray(payload.dispatcherIds) ||
    typeof payload.chunkIndex !== "number" ||
    typeof payload.totalChunks !== "number"
  ) {
    return new Response("Missing / invalid payload", { status: 400 });
  }
  try {
    await runPrewarmChunk(payload);
    return new Response("ok");
  } catch (err) {
    console.error(
      `[/payroll-cache/prewarm/worker/chunk] ${payload.agentId} ${payload.year}-${payload.month}:`,
      err,
    );
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
