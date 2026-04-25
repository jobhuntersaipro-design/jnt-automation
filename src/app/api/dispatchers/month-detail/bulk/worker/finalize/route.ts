import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { finalizeBulkExport } from "@/lib/staff/bulk-finalize";

export const maxDuration = 600; // 10 min — final archive + R2 round-trips

async function handler(req: Request) {
  const t0 = Date.now();
  const { jobId } = (await req.json()) as { jobId: string };
  if (!jobId) return new Response("Missing jobId", { status: 400 });
  console.log(`[/bulk/worker/finalize] received ${jobId.slice(0, 8)} — sig verified`);
  try {
    await finalizeBulkExport(jobId);
    console.log(
      `[/bulk/worker/finalize] ${jobId.slice(0, 8)} ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    return new Response("ok");
  } catch (err) {
    console.error(
      `[/bulk/worker/finalize] ${jobId.slice(0, 8)} FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
      err,
    );
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
