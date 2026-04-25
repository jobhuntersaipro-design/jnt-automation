import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseExcelFromR2 } from "@/lib/upload/parser";
import { splitDispatchers } from "@/lib/upload/dispatcher-check";
import { createUpload, replaceUpload, updateUploadStatus } from "@/lib/db/upload";
import { getAgentDefaults } from "@/lib/db/staff";
import { createNotification } from "@/lib/db/notifications";
import { dispatchWorker } from "@/lib/upload/dispatch-worker";
import { normalizeName } from "@/lib/dispatcher-identity/normalize-name";

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

  const t0 = Date.now();
  const tag = `[upload/detect] ${r2Key.slice(-40)}`;
  const lap = (msg: string) =>
    console.log(`${tag} +${((Date.now() - t0) / 1000).toFixed(1)}s ${msg}`);
  lap("start");

  // Parse just enough rows to detect branch + month/year
  let rows;
  try {
    rows = await parseExcelFromR2(r2Key);
    lap(`parsed ${rows.length} rows from R2`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[upload/detect] parse failed", { r2Key, detail });
    return NextResponse.json(
      {
        error: `Failed to parse file: ${detail}. Please ensure it is a valid J&T delivery export.`,
      },
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
  lap(`detected branch=${detectedBranch} ${year}-${String(month).padStart(2, "0")}`);

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
  lap(`splitDispatchers: ${unknown.length} unknown`);
  if (unknown.length > 0) {
    // Auto-detected branch — pull that branch's defaults if set, otherwise
    // fall back to the agent-level defaults.
    const defaults = await getAgentDefaults(agentId, branch.id);
    lap("loaded agent defaults");

    const txStart = Date.now();
    await prisma.$transaction(async (tx) => {
      // For each unknown extId, find or create the Dispatcher + its Assignment
      const upsertedDispatchers: { id: string }[] = [];
      for (const d of unknown) {
        const existingAssignment = await tx.dispatcherAssignment.findUnique({
          where: { branchId_extId: { branchId: branch.id, extId: d.extId } },
          select: { dispatcherId: true },
        });

        if (existingAssignment) {
          upsertedDispatchers.push({ id: existingAssignment.dispatcherId });
          continue;
        }

        const dispatcher = await tx.dispatcher.create({
          data: {
            agentId,
            name: d.name,
            normalizedName: normalizeName(d.name),
            extId: d.extId,
            icNo: null,
            branchId: branch.id,
          },
          select: { id: true },
        });

        await tx.dispatcherAssignment.create({
          data: {
            dispatcherId: dispatcher.id,
            branchId: branch.id,
            extId: d.extId,
          },
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
          },
        });

        await tx.bonusTier.createMany({
          data: defaults.bonusTiers.map((t) => ({
            dispatcherId: dispatcher.id,
            tier: t.tier,
            minWeight: t.minWeight,
            maxWeight: t.maxWeight,
            commission: t.commission,
          })),
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
    lap(`seeded ${unknown.length} unknown dispatchers in ${((Date.now() - txStart) / 1000).toFixed(1)}s tx`);

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
    await dispatchWorker(result.uploadId!, "parse");
    lap(`done — uploadId=${result.uploadId?.slice(0, 8)} (new) total=${((Date.now() - t0) / 1000).toFixed(1)}s`);

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

  // Evict PDF cache blobs for the old salary records BEFORE the cascade
  // delete wipes them — same rationale as the init route.
  const { invalidateCacheForUpload } = await import("@/lib/staff/pdf-cache");
  await invalidateCacheForUpload(agentId, existingUploadId).catch((err) =>
    console.error("[pdf-cache] invalidate failed:", err),
  );

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
  await dispatchWorker(uploadId, "parse");
  lap(`done — uploadId=${uploadId.slice(0, 8)} (replace) total=${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return NextResponse.json({
    isDuplicate: false,
    uploadId,
    branchCode: branch.code,
    month,
    year,
  });
}
