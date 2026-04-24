import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { runBulkExportChunk } from "@/lib/staff/bulk-export-worker";

export const maxDuration = 300; // 5 min per chunk (well under QStash 15-min cap)

async function handler(req: Request) {
  const { jobId, chunkIndex } = (await req.json()) as {
    jobId: string;
    chunkIndex: number;
  };
  if (!jobId || typeof chunkIndex !== "number") {
    return new Response("Missing jobId or chunkIndex", { status: 400 });
  }
  try {
    await runBulkExportChunk(jobId, chunkIndex);
    return new Response("ok");
  } catch (err) {
    console.error(`[/bulk/worker/chunk] ${jobId}/${chunkIndex}:`, err);
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
