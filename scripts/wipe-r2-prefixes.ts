/**
 * Admin ops script: bulk-delete every object under the listed R2 prefixes.
 * Companion to the DB wipe — used to reset test state without nuking
 * avatars (which live at `avatars/` and are unrelated to the payroll data).
 *
 * Default is dry-run: lists what would be deleted + total size. Add
 * `--confirm` to execute.
 *
 * Usage:
 *   npx tsx scripts/wipe-r2-prefixes.ts                       # dry-run
 *   npx tsx scripts/wipe-r2-prefixes.ts --confirm             # execute
 *
 * Prefixes are hardcoded on purpose — this is a one-shot ops tool, not a
 * general-purpose wipe. Edit the list below if you need to adjust scope.
 * R2 creds come from .env / .env.local (same vars the app uses).
 */
import "dotenv/config";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const PREFIXES_TO_WIPE = ["uploads/", "bulk-exports/", "payroll-cache/"];
const PREFIXES_TO_KEEP = ["avatars/"]; // listed for the report only

async function listAll(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<{ Key: string; Size: number }[]> {
  const results: { Key: string; Size: number }[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) results.push({ Key: obj.Key, Size: obj.Size ?? 0 });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return results;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function main() {
  const confirm = process.argv.includes("--confirm");

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

  console.log(`Bucket: ${bucket}`);
  console.log(`Wipe:   ${PREFIXES_TO_WIPE.join(", ")}`);
  console.log(`Keep:   ${PREFIXES_TO_KEEP.join(", ")}`);
  console.log("");

  let grandTotalObjects = 0;
  let grandTotalBytes = 0;
  const allKeys: string[] = [];

  for (const prefix of PREFIXES_TO_WIPE) {
    const objects = await listAll(client, bucket, prefix);
    const bytes = objects.reduce((s, o) => s + o.Size, 0);
    grandTotalObjects += objects.length;
    grandTotalBytes += bytes;
    allKeys.push(...objects.map((o) => o.Key));
    console.log(
      `  ${prefix.padEnd(20)} ${String(objects.length).padStart(8)} object(s)   ${formatBytes(bytes)}`,
    );
  }

  console.log("");
  console.log(
    `Total: ${grandTotalObjects} object(s)   ${formatBytes(grandTotalBytes)}`,
  );

  if (!confirm) {
    console.log("");
    console.log("Dry-run — no writes performed.");
    console.log("Add --confirm to actually delete.");
    return;
  }

  if (allKeys.length === 0) {
    console.log("");
    console.log("Nothing to delete.");
    return;
  }

  // DeleteObjects caps at 1000 keys per call.
  const batchSize = 1000;
  let deleted = 0;
  for (let i = 0; i < allKeys.length; i += batchSize) {
    const batch = allKeys.slice(i, i + batchSize);
    const res = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    deleted += batch.length - (res.Errors?.length ?? 0);
    if (res.Errors?.length) {
      console.error(`  Batch errors: ${res.Errors.length}`);
      for (const e of res.Errors.slice(0, 5)) {
        console.error(`    ${e.Key}: ${e.Code} ${e.Message}`);
      }
    }
    console.log(`  ...deleted ${Math.min(i + batchSize, allKeys.length)}/${allKeys.length}`);
  }

  console.log("");
  console.log(`Done. ${deleted}/${allKeys.length} object(s) deleted.`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
