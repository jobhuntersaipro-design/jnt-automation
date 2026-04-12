import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { getPreviewData, deletePreviewData } from "@/lib/upload/pipeline";
import { parseExcelFromR2 } from "@/lib/upload/parser";
import { calculateSalary } from "@/lib/upload/calculator";
import type { DispatcherRules } from "@/lib/upload/calculator";
import { prisma } from "@/lib/prisma";

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
    select: { month: true, year: true, r2Key: true, branchId: true },
  });
  if (!fullUpload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  try {
    // Re-parse Excel from R2 to get line items (not stored in KV to stay under 10MB limit)
    const rows = await parseExcelFromR2(fullUpload.r2Key);

    // Load dispatchers with rules for line item calculation
    const dispatcherIds = preview.results.map((r) => r.dispatcherId);
    const dispatchers = await prisma.dispatcher.findMany({
      where: { id: { in: dispatcherIds } },
      include: {
        weightTiers: { orderBy: { tier: "asc" } },
        incentiveRule: true,
        petrolRule: true,
      },
    });

    // Build line items by re-calculating (uses preview penalty/advance values)
    const dispatcherMap = new Map(dispatchers.map((d) => [d.id, d]));
    const previewMap = new Map(preview.results.map((r) => [r.dispatcherId, r]));

    await prisma.$transaction(async (tx) => {
      // Delete any existing salary records for this upload (idempotent re-run)
      await tx.salaryRecord.deleteMany({ where: { uploadId } });

      // Create salary records with snapshots + line items
      const created = await Promise.all(
        preview.results.map((result) =>
          tx.salaryRecord.create({
            data: {
              dispatcherId: result.dispatcherId,
              uploadId,
              month: fullUpload.month,
              year: fullUpload.year,
              totalOrders: result.totalOrders,
              baseSalary: result.baseSalary,
              incentive: result.incentive,
              petrolSubsidy: result.petrolSubsidy,
              penalty: result.penalty,
              advance: result.advance,
              netSalary: result.netSalary,
              weightTiersSnapshot: JSON.parse(JSON.stringify(result.weightTiersSnapshot)),
              incentiveSnapshot: JSON.parse(JSON.stringify(result.incentiveSnapshot)),
              petrolSnapshot: JSON.parse(JSON.stringify(result.petrolSnapshot)),
            },
            select: { id: true, dispatcherId: true },
          }),
        ),
      );

      // Re-derive line items from parsed rows + dispatcher rules
      const recordIdByDispatcher = new Map(
        created.map((r) => [r.dispatcherId, r.id]),
      );

      const allLineItems: {
        salaryRecordId: string;
        waybillNumber: string;
        weight: number;
        commission: number;
        deliveryDate: Date | null;
      }[] = [];

      for (const [dispatcherId, salaryRecordId] of recordIdByDispatcher) {
        const d = dispatcherMap.get(dispatcherId);
        if (!d || !d.incentiveRule || !d.petrolRule) continue;

        const dispatcherRows = rows.filter((r) => r.dispatcherId === d.extId);
        const rules: DispatcherRules = {
          dispatcherId: d.id,
          extId: d.extId,
          weightTiers: d.weightTiers.map((t) => ({
            tier: t.tier,
            minWeight: t.minWeight,
            maxWeight: t.maxWeight,
            commission: t.commission,
          })),
          incentiveRule: {
            orderThreshold: d.incentiveRule.orderThreshold,
            incentiveAmount: d.incentiveRule.incentiveAmount,
          },
          petrolRule: {
            isEligible: d.petrolRule.isEligible,
            dailyThreshold: d.petrolRule.dailyThreshold,
            subsidyAmount: d.petrolRule.subsidyAmount,
          },
        };

        const result = calculateSalary(rules, dispatcherRows);
        for (const li of result.lineItems) {
          allLineItems.push({
            salaryRecordId,
            waybillNumber: li.waybillNumber,
            weight: li.weight,
            commission: li.commission,
            deliveryDate: li.deliveryDate,
          });
        }
      }

      if (allLineItems.length > 0) {
        await tx.salaryLineItem.createMany({ data: allLineItems });
      }

      // Update upload status
      const hasUnknown = preview.unknownDispatchers.length > 0;
      await tx.upload.update({
        where: { id: uploadId },
        data: { status: hasUnknown ? "NEEDS_ATTENTION" : "SAVED" },
      });
    });

    // Clean up KV
    await deletePreviewData(uploadId);

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
