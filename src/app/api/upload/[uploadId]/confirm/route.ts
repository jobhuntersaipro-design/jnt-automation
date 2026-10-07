import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { verifyUploadOwnership, updateUploadStatus } from "@/lib/db/upload";
import { getPreviewData, deletePreviewData } from "@/lib/upload/pipeline";
import { parseExcelFromR2, type ParsedRow } from "@/lib/upload/parser";
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
import {
  groupRowsByExtId,
  lineItemBatches,
  type LineItemSource,
} from "@/lib/upload/line-item-batches";

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
    // 1. Re-parse Excel (needed because raw rows aren't stored in KV), then
    //    group by dispatcher extId. Rows of dispatchers not in the preview
    //    are dropped with the parser's array.
    const writeParseProgress = throttledProgressWriter(uploadId, 500);
    let rows: ParsedRow[] | null = await parseExcelFromR2(fullUpload.r2Key, (rowsParsed) => {
      writeParseProgress({
        stage: "parse",
        stageLabel: "Re-parsing Excel for line items",
        rowsParsed,
        startedAt,
      });
    });
    const rowsParsed = rows.length;
    const rowsByExtId = groupRowsByExtId(
      rows,
      preview.results.map((r) => r.extId),
    );
    rows = null;

    // 2. Build salary record rows from preview results
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

    // 3. One line item per parsed row, so the total is known before pricing.
    let totalLineItems = 0;
    for (const result of preview.results) {
      totalLineItems += rowsByExtId.get(result.extId)?.length ?? 0;
    }

    // 4. Save salary records in one round-trip (createManyAndReturn — Prisma 7).
    //    Also delete any prior records for this upload in a short transaction.
    await setProgress(uploadId, {
      stage: "save",
      stageLabel: "Saving salary records",
      rowsParsed,
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
    const resultByDispatcher = new Map(preview.results.map((r) => [r.dispatcherId, r]));

    // 5. Price and insert line items one batch at a time. Pricing mirrors
    //    the calculator's stable-sort + threshold-split rules so `isBonusTier`
    //    agrees with the preview's baseSalary/bonusTierEarnings totals.
    function* sources(): Generator<LineItemSource> {
      for (const [dispatcherId, salaryRecordId] of recordIdByDispatcher) {
        const result = resultByDispatcher.get(dispatcherId);
        if (!result) continue;
        const bonusTierSnapshot = result.bonusTierSnapshot as BonusTierSnapshot;
        yield {
          salaryRecordId,
          rows: rowsByExtId.get(result.extId) ?? [],
          weightTiers: result.weightTiersSnapshot as WeightTierInput[],
          bonusTiers: bonusTierSnapshot.tiers as BonusTierInput[],
          orderThreshold: bonusTierSnapshot.orderThreshold,
        };
      }
    }

    // Batches stay small because Prisma keeps its last 100 debug log calls
    // (logging off or not), and one of them holds each createMany's query
    // plan, which embeds every row. With 5000-row batches the retained plans
    // alone came to ~400 MB and a 194k-parcel month peaked at 1.7 GB RSS;
    // 500-row batches hold ~20 MB and the same month peaks at ~850 MB.
    const BATCH_SIZE = 500;
    const CONCURRENCY = 4;

    let inserted = 0;
    await setProgress(uploadId, {
      stage: "save",
      stageLabel: "Saving line items",
      rowsParsed,
      lineItemsInserted: 0,
      totalLineItems,
      startedAt,
    });

    await runPool(lineItemBatches(sources(), BATCH_SIZE), CONCURRENCY, async (batch) => {
      await prisma.salaryLineItem.createMany({ data: batch });
      inserted += batch.length;
      await setProgress(uploadId, {
        stage: "save",
        stageLabel: "Saving line items",
        rowsParsed,
        lineItemsInserted: inserted,
        totalLineItems,
        startedAt,
      });
    });

    // 6. Mark SAVED + cleanup
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
