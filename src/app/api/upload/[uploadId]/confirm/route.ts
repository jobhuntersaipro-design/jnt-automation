import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { verifyUploadOwnership, updateUploadStatus } from "@/lib/db/upload";
import { getPreviewData, deletePreviewData } from "@/lib/upload/pipeline";
import { parseExcelFromR2 } from "@/lib/upload/parser";
import { priceLineItems } from "@/lib/upload/calculator";
import type {
  BonusTierSnapshot,
  BonusTierInput,
  WeightTierInput,
} from "@/lib/upload/calculator";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/db/notifications";
import {
  setProgress,
  clearProgress,
  throttledProgressWriter,
} from "@/lib/upload/progress";
import { runPool } from "@/lib/upload/run-pool";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await verifyUploadOwnership(uploadId, session.user.id);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "READY_TO_CONFIRM") {
    return NextResponse.json(
      { error: `Cannot confirm in ${upload.status} state` },
      { status: 409 },
    );
  }

  const preview = await getPreviewData(uploadId);
  if (!preview) {
    return NextResponse.json(
      { error: "Preview data expired. Please re-upload the file." },
      { status: 410 },
    );
  }

  const fullUpload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { month: true, year: true, r2Key: true, branchId: true, branch: { select: { code: true } } },
  });
  if (!fullUpload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Flip to PROCESSING so the client's status poll picks up progress
  // ticks via the stage timeline instead of showing an opaque spinner.
  await updateUploadStatus(uploadId, "PROCESSING");
  const startedAt = Date.now();
  await setProgress(uploadId, {
    stage: "parse",
    stageLabel: "Re-parsing Excel for line items",
    rowsParsed: 0,
    startedAt,
  });

  try {
    // 1. Re-parse Excel (needed because raw rows aren't stored in KV)
    const writeParseProgress = throttledProgressWriter(uploadId, 500);
    const rows = await parseExcelFromR2(fullUpload.r2Key, (rowsParsed) => {
      writeParseProgress({
        stage: "parse",
        stageLabel: "Re-parsing Excel for line items",
        rowsParsed,
        startedAt,
      });
    });

    // 2. Pre-group rows by dispatcher extId ONCE (O(n))
    const rowsByExtId = new Map<string, typeof rows>();
    for (const row of rows) {
      const existing = rowsByExtId.get(row.dispatcherId);
      if (existing) existing.push(row);
      else rowsByExtId.set(row.dispatcherId, [row]);
    }

    // 3. Build salary record rows from preview results
    const salaryRecordData = preview.results.map((result) => ({
      dispatcherId: result.dispatcherId,
      uploadId,
      month: fullUpload.month,
      year: fullUpload.year,
      totalOrders: result.totalOrders,
      baseSalary: result.baseSalary,
      bonusTierEarnings: result.bonusTierEarnings,
      petrolSubsidy: result.petrolSubsidy,
      petrolQualifyingDays: result.petrolQualifyingDays ?? 0,
      penalty: result.penalty,
      advance: result.advance,
      netSalary: result.netSalary,
      weightTiersSnapshot: JSON.parse(JSON.stringify(result.weightTiersSnapshot)),
      bonusTierSnapshot: JSON.parse(JSON.stringify(result.bonusTierSnapshot)),
      petrolSnapshot: JSON.parse(JSON.stringify(result.petrolSnapshot)),
    }));

    // 4. Build all line items upfront so we know total count. Pricing mirrors
    //    the calculator's stable-sort + threshold-split rules so `isBonusTier`
    //    agrees with the preview's baseSalary/bonusTierEarnings totals.
    const lineItemsByDispatcher = new Map<string, { waybillNumber: string; weight: number; commission: number; deliveryDate: Date | null; isBonusTier: boolean }[]>();
    let totalLineItems = 0;
    for (const result of preview.results) {
      const dispatcherRows = rowsByExtId.get(result.extId) ?? [];
      const weightTiers = result.weightTiersSnapshot as WeightTierInput[];
      const bonusTierSnapshot = result.bonusTierSnapshot as BonusTierSnapshot;
      const items = priceLineItems(
        dispatcherRows,
        weightTiers,
        bonusTierSnapshot.tiers as BonusTierInput[],
        bonusTierSnapshot.orderThreshold,
      );
      lineItemsByDispatcher.set(result.dispatcherId, items);
      totalLineItems += items.length;
    }

    // 5. Save salary records in one round-trip (createManyAndReturn — Prisma 7).
    //    Also delete any prior records for this upload in a short transaction.
    await setProgress(uploadId, {
      stage: "save",
      stageLabel: "Saving salary records",
      rowsParsed: rows.length,
      dispatchersProcessed: 0,
      totalDispatchers: salaryRecordData.length,
      lineItemsInserted: 0,
      totalLineItems,
      startedAt,
    });

    const created = await prisma.$transaction(async (tx) => {
      await tx.salaryRecord.deleteMany({ where: { uploadId } });
      return tx.salaryRecord.createManyAndReturn({
        data: salaryRecordData,
        select: { id: true, dispatcherId: true },
      });
    }, { timeout: 30_000 });

    const recordIdByDispatcher = new Map(created.map((r) => [r.dispatcherId, r.id]));

    // 6. Build flat line item list with salaryRecordId
    const allLineItems: {
      salaryRecordId: string;
      waybillNumber: string;
      weight: number;
      commission: number;
      deliveryDate: Date | null;
      isBonusTier: boolean;
    }[] = [];
    for (const [dispatcherId, salaryRecordId] of recordIdByDispatcher) {
      const items = lineItemsByDispatcher.get(dispatcherId);
      if (items) {
        for (const li of items) {
          allLineItems.push({ salaryRecordId, ...li });
        }
      }
    }

    // 7. Insert line items in parallel chunks with live progress reporting.
    //    5000-row chunks keep us well under the Postgres param limit
    //    (~65k / 5 fields ≈ 13k rows max per statement) and stream to KV
    //    frequently enough for the UI to animate.
    const CHUNK_SIZE = 5000;
    const CONCURRENCY = 4;
    const chunks: typeof allLineItems[] = [];
    for (let i = 0; i < allLineItems.length; i += CHUNK_SIZE) {
      chunks.push(allLineItems.slice(i, i + CHUNK_SIZE));
    }

    let inserted = 0;
    await setProgress(uploadId, {
      stage: "save",
      stageLabel: "Saving line items",
      rowsParsed: rows.length,
      lineItemsInserted: 0,
      totalLineItems,
      startedAt,
    });

    await runPool(chunks, CONCURRENCY, async (chunk) => {
      await prisma.salaryLineItem.createMany({ data: chunk });
      inserted += chunk.length;
      await setProgress(uploadId, {
        stage: "save",
        stageLabel: "Saving line items",
        rowsParsed: rows.length,
        lineItemsInserted: inserted,
        totalLineItems,
        startedAt,
      });
    });

    // 8. Mark SAVED + cleanup
    await updateUploadStatus(uploadId, "SAVED");
    await deletePreviewData(uploadId);
    await clearProgress(uploadId);

    // Bust dashboard cache so new data shows immediately
    revalidatePath("/dashboard");

    // Notification (non-fatal)
    const monthName = new Date(fullUpload.year, fullUpload.month - 1).toLocaleString("en", { month: "long" });
    await createNotification({
      agentId: session.user.id,
      type: "payroll",
      message: "Payroll confirmed",
      detail: `${fullUpload.branch.code} — ${monthName} ${fullUpload.year} · ${preview.results.length} staff`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      savedCount: preview.results.length,
      totalLineItems,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("Failed to confirm payroll:", error);
    // Roll status back so the user can retry via the same UI
    const message = error instanceof Error ? error.message : "Failed to save payroll";
    try {
      await updateUploadStatus(uploadId, "READY_TO_CONFIRM", message);
      await clearProgress(uploadId);
    } catch {
      // Upload may have been deleted mid-flight
    }
    return NextResponse.json(
      { error: `Failed to save payroll: ${message}` },
      { status: 500 },
    );
  }
}
