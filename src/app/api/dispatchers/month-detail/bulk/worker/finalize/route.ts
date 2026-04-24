import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { finalizeBulkExport } from "@/lib/staff/bulk-finalize";

export const maxDuration = 600; // 10 min — final archive + R2 round-trips

async function handler(req: Request) {
  const { jobId } = (await req.json()) as { jobId: string };
  if (!jobId) return new Response("Missing jobId", { status: 400 });
  try {
    await finalizeBulkExport(jobId);
    return new Response("ok");
  } catch (err) {
    console.error(`[/bulk/worker/finalize] ${jobId}:`, err);
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
