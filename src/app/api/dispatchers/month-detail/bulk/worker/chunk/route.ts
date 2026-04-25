import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { runBulkExportChunk } from "@/lib/staff/bulk-export-worker";

export const maxDuration = 300; // 5 min per chunk (well under QStash 15-min cap)

async function handler(req: Request) {
  const t0 = Date.now();
  const { jobId, chunkIndex } = (await req.json()) as {
    jobId: string;
    chunkIndex: number;
  };
  if (!jobId || typeof chunkIndex !== "number") {
    return new Response("Missing jobId or chunkIndex", { status: 400 });
  }
  console.log(
    `[/bulk/worker/chunk] received ${jobId.slice(0, 8)}/${chunkIndex} — sig verified`,
  );
  try {
    await runBulkExportChunk(jobId, chunkIndex);
    console.log(
      `[/bulk/worker/chunk] ${jobId.slice(0, 8)}/${chunkIndex} ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    return new Response("ok");
  } catch (err) {
    console.error(
      `[/bulk/worker/chunk] ${jobId.slice(0, 8)}/${chunkIndex} FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
      err,
    );
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
