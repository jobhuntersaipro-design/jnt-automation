/**
 * Admin ops script: invalidate the canonical bulk-export ZIP cached at
 *   payroll-cache/{agentId}/{year}-{mm}/details.{fmt}.zip
 *
 * Use when a poisoned blob is stuck in R2 (e.g. a 22-byte empty-archive zip
 * that every `/bulk/start` cache-hit hands back to the browser with the
 * "empty or non-readable" error). Deleting it forces the next bulk-start to
 * miss and regenerate.
 *
 * Prints the current size via HEAD before deleting, so you can sanity-check
 * that you're about to nuke a broken blob (22 bytes ≈ empty zip) rather than
 * a healthy cache.
 *
 * Usage:
 *   npx tsx scripts/invalidate-payroll-cache.ts \
 *     --agent <agentId> --year 2026 --month 3 --format pdf
 *
 * Add `--confirm` to execute. Without it, the script just HEADs the object
 * and prints what it WOULD delete (dry-run by default — destructive ops
 * should never run on a mistyped arg).
 *
 * Optional:
 *   --include-per-record    Also delete every per-record PDF/CSV blob under
 *                           payroll-cache/{agentId}/{year}-{mm}/*.{pdf,csv}
 *                           Useful when the same render bug affected the
 *                           per-record cache too.
 *
 * R2 creds come from .env / .env.local (same vars the app uses:
 * R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).
 * Point those at the environment you want to clean (prod vs dev).
 */
import "dotenv/config";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

interface Args {
  agentId: string;
  year: number;
  month: number;
  format: "pdf" | "csv";
  confirm: boolean;
  includePerRecord: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }

  const agentId = args.agent as string | undefined;
  const year = args.year ? Number(args.year) : NaN;
  const month = args.month ? Number(args.month) : NaN;
  const format = args.format as string | undefined;

  const missing: string[] = [];
  if (!agentId) missing.push("--agent <agentId>");
  if (!Number.isInteger(year)) missing.push("--year <yyyy>");
  if (!Number.isInteger(month) || month < 1 || month > 12)
    missing.push("--month <1-12>");
  if (format !== "pdf" && format !== "csv")
    missing.push("--format <pdf|csv>");

  if (missing.length > 0) {
    console.error("Missing or invalid args:");
    for (const m of missing) console.error(`  ${m}`);
    console.error("");
    console.error(
      "Example: npx tsx scripts/invalidate-payroll-cache.ts \\",
    );
    console.error(
      "  --agent clxxxx... --year 2026 --month 3 --format pdf --confirm",
    );
    process.exit(1);
  }

  return {
    agentId: agentId!,
    year,
    month,
    format: format as "pdf" | "csv",
    confirm: Boolean(args.confirm),
    includePerRecord: Boolean(args["include-per-record"]),
  };
}

function mm(month: number): string {
  return String(month).padStart(2, "0");
}

function zipKey(
  agentId: string,
  year: number,
  month: number,
  format: "pdf" | "csv",
): string {
  return `payroll-cache/${agentId}/${year}-${mm(month)}/details.${format}.zip`;
}

function monthPrefix(agentId: string, year: number, month: number): string {
  return `payroll-cache/${agentId}/${year}-${mm(month)}/`;
}

async function headSize(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<number | null> {
  try {
    const res = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return res.ContentLength ?? null;
  } catch (err: unknown) {
    if (!err || typeof err !== "object") throw err;
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NoSuchKey" || e.name === "NotFound") return null;
    if (e.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

async function listPerRecordKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      // Skip the bulk ZIPs — those are handled separately so the summary
      // output is clear. Keep only per-record blobs (.pdf / .csv).
      if (obj.Key.endsWith("/details.pdf.zip")) continue;
      if (obj.Key.endsWith("/details.csv.zip")) continue;
      if (obj.Key.endsWith(".pdf") || obj.Key.endsWith(".csv")) {
        keys.push(obj.Key);
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKey || !secretKey || !bucket) {
    console.error(
      "Missing R2 env vars. Need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.",
    );
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  const targetKey = zipKey(args.agentId, args.year, args.month, args.format);
  console.log(`Bucket:  ${bucket}`);
  console.log(`Target:  ${targetKey}`);

  const size = await headSize(client, bucket, targetKey);
  if (size === null) {
    console.log(`Status:  NOT FOUND — nothing to delete.`);
  } else {
    const tag = size === 22 ? "  ← empty-archive EOCD (poisoned)" : "";
    console.log(`Status:  EXISTS (${size} bytes)${tag}`);
  }

  let perRecordKeys: string[] = [];
  if (args.includePerRecord) {
    const prefix = monthPrefix(args.agentId, args.year, args.month);
    perRecordKeys = await listPerRecordKeys(client, bucket, prefix);
    console.log(
      `Per-record blobs under ${prefix}: ${perRecordKeys.length} object(s)`,
    );
  }

  if (!args.confirm) {
    console.log("");
    console.log("Dry-run — no writes performed.");
    console.log("Add --confirm to actually delete.");
    return;
  }

  // ─── Execute ────────────────────────────────────────────────
  if (size !== null) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: targetKey }));
    console.log(`Deleted: ${targetKey}`);
  }

  if (perRecordKeys.length > 0) {
    // R2 DeleteObjects caps at 1000 keys per call.
    const batchSize = 1000;
    for (let i = 0; i < perRecordKeys.length; i += batchSize) {
      const batch = perRecordKeys.slice(i, i + batchSize);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }
    console.log(`Deleted: ${perRecordKeys.length} per-record blob(s)`);
  }

  console.log("");
  console.log(
    "Done. Next /bulk/start for this (agent, month, format) will cache-miss and regenerate.",
  );
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
