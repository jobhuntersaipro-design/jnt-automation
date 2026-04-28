// One-shot: replace xiangtransport@gmail.com's company stamp with the file
// passed via STAMP_FILE. Looks up the agent in the env-configured database,
// uploads the JPEG to R2 at stamps/{agentId}/stamp.jpg, deletes any prior
// stamp object at a different extension, and updates Agent.stampImageUrl.
//
// Run twice — once with .env (dev) loaded, once with .env.production. R2 is
// shared across environments but the agentId differs between dev and prod,
// so each DB row points at its own R2 key.
//
// Usage:
//   STAMP_FILE="WhatsApp Image 2026-04-13 at 18.23.38.jpeg" \
//     npx tsx scripts/replace-stamp.ts

import "dotenv/config";
import { readFileSync } from "node:fs";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "../src/lib/r2";
import { prisma } from "../src/lib/prisma";

const TARGET_EMAIL = "xiangtransport@gmail.com";

async function main() {
  const filePath = process.env.STAMP_FILE;
  if (!filePath) throw new Error("STAMP_FILE env var required");

  const buffer = readFileSync(filePath);
  if (
    buffer.length < 3 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[2] !== 0xff
  ) {
    throw new Error("File is not a JPEG (magic bytes mismatch)");
  }

  const agent = await prisma.agent.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, email: true, stampImageUrl: true },
  });
  if (!agent) {
    throw new Error(`Agent ${TARGET_EMAIL} not found in this database`);
  }

  const newKey = `stamps/${agent.id}/stamp.jpg`;
  const newUrl = `${R2_PUBLIC_URL}/${newKey}`;

  console.log(`Agent: ${agent.email} (${agent.id})`);
  console.log(`Previous stamp: ${agent.stampImageUrl ?? "(none)"}`);
  console.log(`New stamp:      ${newUrl}`);
  console.log(`Uploading ${buffer.length} bytes to ${newKey}...`);

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: newKey,
      Body: buffer,
      ContentType: "image/jpeg",
    }),
  );

  // If the previous URL pointed at a different key (e.g. .png/.webp), drop the
  // old object so it can't be served alongside the new one.
  if (agent.stampImageUrl) {
    const prevKey = agent.stampImageUrl.replace(`${R2_PUBLIC_URL}/`, "");
    if (prevKey !== newKey) {
      try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: prevKey }));
        console.log(`Deleted previous R2 object: ${prevKey}`);
      } catch (err) {
        console.warn(`Could not delete previous R2 object ${prevKey}:`, err);
      }
    }
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: { stampImageUrl: newUrl },
  });

  console.log(`Updated Agent.stampImageUrl for ${agent.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
