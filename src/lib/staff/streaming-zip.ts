import archiver from "archiver";
import { Upload } from "@aws-sdk/lib-storage";
import { PassThrough } from "node:stream";
import { r2, R2_BUCKET } from "@/lib/r2";

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
    // Cloudflare R2 minimum part size is 5 MiB; default (10MB) is slightly
    // oversized for small exports but fine for large ones.
  });

  // Archiver errors bubble up through the stream; capture them so we can
  // abort the upload cleanly.
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

  await upload.done();
}
