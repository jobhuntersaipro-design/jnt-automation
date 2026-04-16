import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { getPreviewData, deletePreviewData } from "@/lib/upload/pipeline";
import { parseExcelFromR2 } from "@/lib/upload/parser";
import { getCommission } from "@/lib/upload/calculator";
import type { WeightTierInput } from "@/lib/upload/calculator";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/db/notifications";

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

  try {
    // Re-parse Excel from R2 to get line items (not stored in KV to stay under 10MB limit)
    const rows = await parseExcelFromR2(fullUpload.r2Key);

    // Pre-group rows by dispatcher extId ONCE (avoids O(n*m) repeated filtering)
    const rowsByExtId = new Map<string, typeof rows>();
    for (const row of rows) {
      const existing = rowsByExtId.get(row.dispatcherId);
      if (existing) {
        existing.push(row);
      } else {
        rowsByExtId.set(row.dispatcherId, [row]);
      }
    }

    // Build salary records data from preview (already calculated — no need to recalculate)
    const salaryRecordData = preview.results.map((result) => ({
      dispatcherId: result.dispatcherId,
      uploadId,
      month: fullUpload.month,
      year: fullUpload.year,
      totalOrders: result.totalOrders,
      baseSalary: result.baseSalary,
      incentive: result.incentive,
      petrolSubsidy: result.petrolSubsidy,
      petrolQualifyingDays: result.petrolQualifyingDays ?? 0,
      penalty: result.penalty,
      advance: result.advance,
      netSalary: result.netSalary,
      weightTiersSnapshot: JSON.parse(JSON.stringify(result.weightTiersSnapshot)),
      incentiveSnapshot: JSON.parse(JSON.stringify(result.incentiveSnapshot)),
      petrolSnapshot: JSON.parse(JSON.stringify(result.petrolSnapshot)),
    }));

    // Build line items directly from parsed rows + weight tier snapshots
    // (skip full calculateSalary — we only need waybill, weight, commission, date)
    const lineItemsByDispatcher = new Map<string, { waybillNumber: string; weight: number; commission: number; deliveryDate: Date | null }[]>();
    for (const result of preview.results) {
      const dispatcherRows = rowsByExtId.get(result.extId) ?? [];
      const tiers = result.weightTiersSnapshot as WeightTierInput[];

      const items = dispatcherRows.map((row) => ({
        waybillNumber: row.waybillNumber,
        weight: row.billingWeight,
        commission: getCommission(row.billingWeight, tiers),
        deliveryDate: row.deliveryDate,
      }));

      lineItemsByDispatcher.set(result.dispatcherId, items);
    }

    // Transaction: delete old + create salary records + mark as SAVED
    // Line items inserted outside transaction to reduce lock duration
    const recordIdByDispatcher = await prisma.$transaction(async (tx) => {
      await tx.salaryRecord.deleteMany({ where: { uploadId } });

      const idMap = new Map<string, string>();
      for (const data of salaryRecordData) {
        const record = await tx.salaryRecord.create({
          data,
          select: { id: true, dispatcherId: true },
        });
        idMap.set(record.dispatcherId, record.id);
      }

      await tx.upload.update({
        where: { id: uploadId },
        data: { status: "SAVED" },
      });

      return idMap;
    }, { timeout: 60000 });

    // Insert line items outside transaction in larger chunks
    const CHUNK_SIZE = 20000;
    const allLineItems: {
      salaryRecordId: string;
      waybillNumber: string;
      weight: number;
      commission: number;
      deliveryDate: Date | null;
    }[] = [];

    for (const [dispatcherId, salaryRecordId] of recordIdByDispatcher) {
      const items = lineItemsByDispatcher.get(dispatcherId);
      if (items) {
        for (const li of items) {
          allLineItems.push({ salaryRecordId, ...li });
        }
      }
    }

    for (let i = 0; i < allLineItems.length; i += CHUNK_SIZE) {
      await prisma.salaryLineItem.createMany({
        data: allLineItems.slice(i, i + CHUNK_SIZE),
      });
    }

    // Clean up KV
    await deletePreviewData(uploadId);

    // Bust dashboard cache so new data shows immediately
    revalidatePath("/dashboard");

    // Create notification
    const monthName = new Date(fullUpload.year, fullUpload.month - 1).toLocaleString("en", { month: "long" });
    await createNotification({
      agentId: session.user.id,
      type: "payroll",
      message: "Payroll confirmed",
      detail: `${fullUpload.branch.code} — ${monthName} ${fullUpload.year} · ${preview.results.length} staff`,
    }).catch(() => {}); // non-fatal

    return NextResponse.json({
      success: true,
      savedCount: preview.results.length,
    });
  } catch (error) {
    console.error("Failed to confirm payroll:", error);
    return NextResponse.json(
      { error: "Failed to save payroll. Please try again." },
      { status: 500 },
    );
  }
}
