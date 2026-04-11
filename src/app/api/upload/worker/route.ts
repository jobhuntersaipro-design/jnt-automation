import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { updateUploadStatus } from "@/lib/db/upload";

async function handler(req: Request) {
  const { uploadId } = (await req.json()) as { uploadId: string };

  try {
    // TODO: Upload Phase 2 — parse Excel, calculate salaries, store results
    // For now, mark as FAILED with a placeholder message
    await updateUploadStatus(
      uploadId,
      "FAILED",
      "Processing not yet implemented (Upload Phase 2).",
    );

    return new Response("ok");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error";

    await updateUploadStatus(uploadId, "FAILED", message);
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
