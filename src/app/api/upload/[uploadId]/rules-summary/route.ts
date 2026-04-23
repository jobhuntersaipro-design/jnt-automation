import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { getPreviewData } from "@/lib/upload/pipeline";
import { buildRulesSummary } from "@/lib/payroll/snapshot";
import type { DispatcherRulesSummary, PreviousSnapshot } from "@/lib/payroll/snapshot";

export async function GET(
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
      { error: `Cannot view rules summary in ${upload.status} state` },
      { status: 409 },
    );
  }

  // Get preview data to know which dispatchers are included
  const preview = await getPreviewData(uploadId);
  if (!preview) {
    return NextResponse.json(
      { error: "Preview data expired. Please re-upload the file." },
      { status: 410 },
    );
  }

  const dispatcherIds = preview.results.map((r) => r.dispatcherId);

  // Load current dispatcher rules
  const dispatchers = await prisma.dispatcher.findMany({
    where: { id: { in: dispatcherIds } },
    include: {
      weightTiers: { orderBy: { tier: "asc" } },
      incentiveRule: true,
      bonusTiers: { orderBy: { tier: "asc" } },
      petrolRule: true,
    },
  });

  // Get the upload's month/year to find previous month snapshots
  const fullUpload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { month: true, year: true },
  });
  if (!fullUpload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Calculate previous month
  const prevMonth = fullUpload.month === 1 ? 12 : fullUpload.month - 1;
  const prevYear = fullUpload.month === 1 ? fullUpload.year - 1 : fullUpload.year;

  // Fetch previous month salary records with snapshots
  const prevRecords = await prisma.salaryRecord.findMany({
    where: {
      dispatcherId: { in: dispatcherIds },
      month: prevMonth,
      year: prevYear,
    },
    select: {
      dispatcherId: true,
      weightTiersSnapshot: true,
      bonusTierSnapshot: true,
      petrolSnapshot: true,
    },
  });

  const previousSnapshots = new Map<string, PreviousSnapshot>();
  for (const rec of prevRecords) {
    if (rec.weightTiersSnapshot && rec.bonusTierSnapshot && rec.petrolSnapshot) {
      previousSnapshots.set(rec.dispatcherId, {
        weightTiersSnapshot: rec.weightTiersSnapshot as unknown as PreviousSnapshot["weightTiersSnapshot"],
        bonusTierSnapshot: rec.bonusTierSnapshot as unknown as PreviousSnapshot["bonusTierSnapshot"],
        petrolSnapshot: rec.petrolSnapshot as unknown as PreviousSnapshot["petrolSnapshot"],
      });
    }
  }

  // Build summary rows
  const dispatcherRules: DispatcherRulesSummary[] = dispatchers
    .filter((d) => d.incentiveRule && d.petrolRule)
    .map((d) => ({
      dispatcherId: d.id,
      extId: d.extId,
      name: d.name,
      weightTiers: d.weightTiers.map((t) => ({
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
      incentiveRule: {
        orderThreshold: d.incentiveRule!.orderThreshold,
      },
      bonusTiers: d.bonusTiers.map((t) => ({
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
      petrolRule: {
        isEligible: d.petrolRule!.isEligible,
        dailyThreshold: d.petrolRule!.dailyThreshold,
        subsidyAmount: d.petrolRule!.subsidyAmount,
      },
    }));

  const rows = buildRulesSummary(dispatcherRules, previousSnapshots);
  const hasPreviousData = prevRecords.length > 0;

  return NextResponse.json({ rows, hasPreviousData });
}
