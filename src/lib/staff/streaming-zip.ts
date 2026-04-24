import archiver from "archiver";
import { Upload } from "@aws-sdk/lib-storage";
import { PassThrough } from "node:stream";
import { r2, R2_BUCKET } from "@/lib/r2";

const UPLOAD_TIMEOUT_MS = 120_000; // 2 min — anything longer is a config bug

export interface ZipEntry {
  fileName: string;
  /** File contents: a Buffer, Uint8Array, or a string (UTF-8). */
  data: Buffer | Uint8Array | string;
}

/**
 * Stream a collection of files into an R2 object as a ZIP, without buffering
 * the full archive in memory. Uses archiver piped through a PassThrough into
 * @aws-sdk/lib-storage's multipart Upload.
 *
 * Why not JSZip + PutObjectCommand:
 *   - JSZip buffers the full archive in memory, doubling peak RAM at zip time
 *   - PutObjectCommand needs a known-size body; multipart Upload handles streams
 *
 * PDFs compress almost nothing (they're already DEFLATEd internally), so we
 * run zlib level 1 — trades ~2% extra size for ~3× faster compression.
 *
 * Returns when the upload completes.
 */
export async function streamZipToR2(
  key: string,
  files: ZipEntry[],
): Promise<void> {
  // Refuse to write a zero-entry archive. Archiver would happily emit a
  // 22-byte EOCD-only zip that macOS / 7-zip report as "empty or non-readable",
  // and because cache keys under `payroll-cache/` have no R2 lifecycle rule,
  // the bad blob would persist until manually invalidated. Failing here
  // surfaces the upstream bug (usually: all per-dispatcher file generations
  // threw) as a visible job failure instead.
  if (files.length === 0) {
    throw new Error(
      `streamZipToR2: refusing to create an empty archive at ${key}`,
    );
  }

  // Fail fast if R2 env isn't configured — otherwise the SDK quietly retries
  // on every request and the caller hangs for minutes before any error
  // surfaces. In prod Vercel these are always set; this guard is for dev.
  const missing: string[] = [];
  if (!process.env.R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!process.env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!process.env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!R2_BUCKET) missing.push("R2_BUCKET_NAME");
  if (missing.length > 0) {
    throw new Error(
      `streamZipToR2: missing R2 env var(s): ${missing.join(", ")}`,
    );
  }

  const archive = archiver("zip", { zlib: { level: 1 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  const upload = new Upload({
    client: r2,
    params: {
      Bucket: R2_BUCKET,
      Key: key,
      Body: passthrough,
      ContentType: "application/zip",
    },
    queueSize: 2,
  });

  // Observability — log each multipart part as it uploads so a stalled
  // upload (network, creds, bucket) surfaces before the 2-min timeout.
  let uploadedBytes = 0;
  upload.on("httpUploadProgress", (p) => {
    if (typeof p.loaded === "number") {
      uploadedBytes = p.loaded;
      console.log(
        `[streaming-zip] ${key} part=${p.part ?? "?"} loaded=${p.loaded} total=${p.total ?? "?"}`,
      );
    }
  });

  archive.on("error", (err) => passthrough.destroy(err));

  for (const f of files) {
    const content =
      typeof f.data === "string"
        ? Buffer.from(f.data, "utf8")
        : Buffer.isBuffer(f.data)
          ? f.data
          : Buffer.from(f.data);
    archive.append(content, { name: f.fileName });
  }
  await archive.finalize();

  // Race the upload against a hard timeout so config issues fail loud.
  await Promise.race([
    upload.done(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `streamZipToR2: upload to ${key} timed out after ${UPLOAD_TIMEOUT_MS / 1000}s (${uploadedBytes} bytes sent). Check R2 endpoint/credentials/bucket.`,
            ),
          ),
        UPLOAD_TIMEOUT_MS,
      ),
    ),
  ]);
}
