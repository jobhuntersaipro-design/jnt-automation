import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

/**
 * Generate a short-lived presigned GET URL so the browser can download the
 * object straight from R2 — bypassing the Next.js route handler entirely.
 *
 * Without this, every download flows through our Vercel function: it burns
 * function duration, doubles the bytes on the wire (R2 → function → client),
 * and forces the client to buffer the full response before the browser can
 * save it. With it, the route handler just signs a URL and returns a 302.
 *
 * `filename`, when provided, is rendered into the `response-content-disposition`
 * query param so R2 serves the object with `Content-Disposition: attachment;
 * filename="..."` — triggering a download in the browser rather than an
 * inline render. `disposition` lets PDF previews opt into `inline`.
 *
 * `contentType` sets `response-content-type`, which matters because objects
 * written to R2 without an explicit `ContentType` get `application/octet-stream`
 * and the browser then refuses to render them inline.
 */
export async function getPresignedDownloadUrl(
  key: string,
  opts: {
    filename?: string;
    disposition?: "attachment" | "inline";
    contentType?: string;
    expiresIn?: number;
  } = {},
): Promise<string> {
  const {
    filename,
    disposition = "attachment",
    contentType,
    expiresIn = 300,
  } = opts;

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ResponseContentDisposition: filename
      ? `${disposition}; filename="${sanitizeFilename(filename)}"`
      : disposition,
    ResponseContentType: contentType,
  });

  return getSignedUrl(r2, command, { expiresIn });
}

// Strip characters that would break the Content-Disposition header. R2 accepts
// the value verbatim, so a stray quote or newline would corrupt the response.
function sanitizeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, "_");
}

/**
 * Cheap existence check — used before signing a download URL so we can
 * return a 410 Gone when the underlying blob was evicted (rather than
 * handing the browser a URL that will 404 mid-download).
 */
export async function hasR2Object(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (err: unknown) {
    if (!err || typeof err !== "object") throw err;
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NoSuchKey" || e.name === "NotFound") return false;
    if (e.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}
