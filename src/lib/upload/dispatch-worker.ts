import { Client } from "@upstash/qstash";
import { processUpload, calculateAfterConfirm } from "./pipeline";
import { updateUploadStatus } from "@/lib/db/upload";

const qstash = new Client({ token: process.env.QSTASH_TOKEN ?? "" });

type WorkerPhase = "parse" | "calculate";

/**
 * Trigger the background worker for an upload.
 *
 * In production, publishes a QStash job to hit /api/upload/worker.
 * In development, runs the worker function inline (fire-and-forget) so
 * localhost URLs don't need to be reachable from QStash's servers.
 *
 * The dev path is non-blocking — the HTTP response returns immediately
 * and the worker runs on the server event loop. Errors are captured
 * and written to the upload's errorMessage, mirroring the prod worker.
 */
export async function dispatchWorker(
  uploadId: string,
  phase: WorkerPhase,
): Promise<void> {
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    // Fire-and-forget — run the worker logic inline on the Node process.
    // We don't await so the triggering HTTP request can return quickly.
    // Errors are written to the upload row just like the prod worker does.
    Promise.resolve()
      .then(async () => {
        try {
          if (phase === "calculate") {
            await calculateAfterConfirm(uploadId);
          } else {
            await processUpload(uploadId);
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown processing error";
          console.error(
            `[dev-worker] ${phase} failed for ${uploadId}:`,
            message,
          );
          try {
            await updateUploadStatus(uploadId, "FAILED", message);
          } catch {
            // Upload may have been deleted
          }
        }
      })
      .catch(() => {
        // unreachable — inner try/catch swallows
      });
    return;
  }

  // Production — publish to QStash
  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/upload/worker`,
    body: phase === "calculate" ? { uploadId, phase: "calculate" } : { uploadId },
    retries: 2,
  });
}
