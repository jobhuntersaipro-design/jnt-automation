import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { updateUploadStatus } from "@/lib/db/upload";
import { processUpload, calculateAfterConfirm } from "@/lib/upload/pipeline";

async function handler(req: Request) {
  const { uploadId, phase } = (await req.json()) as {
    uploadId: string;
    phase?: "calculate";
  };

  try {
    if (phase === "calculate") {
      await calculateAfterConfirm(uploadId);
    } else {
      await processUpload(uploadId);
    }
    return new Response("ok");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error";

    // Upload may have been deleted (cancelled/replaced) while worker was running
    try {
      await updateUploadStatus(uploadId, "FAILED", message);
    } catch {
      // Upload no longer exists — nothing to update
    }
    return new Response("error", { status: 500 });
  }
}

export const POST = verifySignatureAppRouter(handler);
