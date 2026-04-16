import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Client } from "@upstash/qstash";
import { parseExcelFromR2 } from "@/lib/upload/parser";
import { splitDispatchers } from "@/lib/upload/dispatcher-check";
import { createUpload, replaceUpload, updateUploadStatus } from "@/lib/db/upload";
import { getAgentDefaults } from "@/lib/db/staff";
import { createNotification } from "@/lib/db/notifications";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

/**
 * POST /api/upload/detect
 * After file is uploaded to R2, parse it to auto-detect branch + month/year,
 * create the Upload row, and trigger processing.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentId = session.user.id;
  const body = await req.json();
  const { r2Key, fileName, confirmReplace, existingUploadId } = body as {
    r2Key?: string;
    fileName?: string;
    confirmReplace?: boolean;
    existingUploadId?: string;
  };

  if (!r2Key || !fileName) {
    return NextResponse.json({ error: "r2Key and fileName are required" }, { status: 400 });
  }

  // Parse just enough rows to detect branch + month/year
  let rows;
  try {
    rows = await parseExcelFromR2(r2Key);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse file. Please ensure it is a valid Excel file." },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No delivery rows found in the uploaded file." },
      { status: 400 },
    );
  }

  // Detect branch code — most common branchName value
  const branchCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.branchName) {
      branchCounts.set(row.branchName, (branchCounts.get(row.branchName) ?? 0) + 1);
    }
  }
  const detectedBranch = [...branchCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  if (!detectedBranch) {
    return NextResponse.json(
      { error: "Could not detect branch code from the file. Column K (Branch Name) appears to be empty." },
      { status: 400 },
    );
  }

  // Detect month/year — most common month+year from delivery dates
  const dateCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.deliveryDate) {
      const key = `${row.deliveryDate.getMonth() + 1}-${row.deliveryDate.getFullYear()}`;
      dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1);
    }
  }
  const topDate = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  if (!topDate) {
    return NextResponse.json(
      { error: "Could not detect month/year from the file. Column L (Delivery Date) appears to be empty." },
      { status: 400 },
    );
  }

  const [month, year] = topDate.split("-").map(Number);

  // Find or auto-create branch for this agent
  let branch = await prisma.branch.findFirst({
    where: { code: detectedBranch, agentId },
    select: { id: true, code: true },
  });

  if (!branch) {
    // Check branch limit before creating
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { maxBranches: true, _count: { select: { branches: true } } },
    });

    if (agent && agent._count.branches >= agent.maxBranches) {
      return NextResponse.json(
        { error: "You've reached your branch limit. Contact support to upgrade." },
        { status: 403 },
      );
    }

    branch = await prisma.branch.create({
      data: { code: detectedBranch, agentId },
      select: { id: true, code: true },
    });
  }

  // Auto-create unknown dispatchers with default rules so they appear on Staff page
  const { unknown } = await splitDispatchers(rows, agentId);
  if (unknown.length > 0) {
    const defaults = await getAgentDefaults(agentId);

    await prisma.$transaction(async (tx) => {
      // Upsert all unknown dispatchers
      const upsertedDispatchers: { id: string }[] = [];
      for (const d of unknown) {
        const dispatcher = await tx.dispatcher.upsert({
          where: { branchId_extId: { branchId: branch.id, extId: d.extId } },
          update: {},
          create: {
            name: d.name,
            extId: d.extId,
            icNo: "",
            branchId: branch.id,
          },
          select: { id: true },
        });
        upsertedDispatchers.push(dispatcher);
      }

      // Batch-check which dispatchers already have weight tiers
      const tierCounts = await tx.weightTier.groupBy({
        by: ["dispatcherId"],
        where: { dispatcherId: { in: upsertedDispatchers.map((d) => d.id) } },
        _count: true,
      });
      const hasTiers = new Set(tierCounts.map((r) => r.dispatcherId));

      // Only seed rules for dispatchers without existing tiers
      for (let i = 0; i < upsertedDispatchers.length; i++) {
        const dispatcher = upsertedDispatchers[i];
        if (hasTiers.has(dispatcher.id)) continue;

        const d = unknown[i];
        await tx.weightTier.createMany({
          data: defaults.weightTiers.map((t) => ({
            dispatcherId: dispatcher.id,
            tier: t.tier,
            minWeight: t.minWeight,
            maxWeight: t.maxWeight,
            commission: t.commission,
          })),
        });

        await tx.incentiveRule.create({
          data: {
            dispatcherId: dispatcher.id,
            orderThreshold: defaults.incentiveRule.orderThreshold,
            incentiveAmount: defaults.incentiveRule.incentiveAmount,
          },
        });

        await tx.petrolRule.create({
          data: {
            dispatcherId: dispatcher.id,
            isEligible: defaults.petrolRule.isEligible,
            dailyThreshold: defaults.petrolRule.dailyThreshold,
            subsidyAmount: defaults.petrolRule.subsidyAmount,
          },
        });
      }
    }, { timeout: 120000 });

    // Notify about new dispatchers
    if (unknown.length > 0) {
      await createNotification({
        agentId,
        type: "new_dispatcher",
        message: `${unknown.length} new dispatcher${unknown.length > 1 ? "s" : ""} detected`,
        detail: `${branch.code} — ${unknown.slice(0, 3).map((d) => d.name).join(", ")}${unknown.length > 3 ? ` +${unknown.length - 3} more` : ""}`,
      }).catch(() => {});
    }
  }

  // Handle duplicate check or replacement
  if (!confirmReplace) {
    const result = await createUpload({
      branchId: branch.id,
      fileName,
      r2Key,
      month,
      year,
    });

    if (result.isDuplicate) {
      const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });
      return NextResponse.json({
        isDuplicate: true,
        existingUploadId: result.existingUploadId,
        branchCode: branch.code,
        month,
        year,
        r2Key,
        message: `Payroll for ${branch.code} — ${monthName} ${year} already exists. Re-uploading will delete existing salary records. Dispatcher settings will be kept.`,
      });
    }

    // Trigger processing
    await updateUploadStatus(result.uploadId!, "PROCESSING");
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/api/upload/worker`,
      body: { uploadId: result.uploadId },
      retries: 2,
    });

    return NextResponse.json({
      isDuplicate: false,
      uploadId: result.uploadId,
      branchCode: branch.code,
      month,
      year,
    });
  }

  // confirmReplace = true
  if (!existingUploadId) {
    return NextResponse.json({ error: "Missing existingUploadId" }, { status: 400 });
  }

  const uploadId = await replaceUpload({
    existingUploadId,
    agentId,
    branchId: branch.id,
    fileName,
    r2Key,
    month,
    year,
  });

  await updateUploadStatus(uploadId, "PROCESSING");
  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/upload/worker`,
    body: { uploadId },
    retries: 2,
  });

  return NextResponse.json({
    isDuplicate: false,
    uploadId,
    branchCode: branch.code,
    month,
    year,
  });
}
