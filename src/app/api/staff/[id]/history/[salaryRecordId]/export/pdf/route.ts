import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getMonthDetail } from "@/lib/db/staff";
import {
  buildTierBreakdown,
  type BonusTierSnapshotRow,
  type WeightTierSnapshot,
} from "@/lib/staff/month-detail";
import { readBonusTierSnapshot } from "@/lib/staff/bonus-tier-snapshot";
import { generateMonthDetailPdf } from "@/lib/staff/month-detail-pdf";
import { monthDetailFilename } from "@/lib/staff/month-detail-filename";
import { hasCached, pdfKey, putCached } from "@/lib/staff/pdf-cache";
import { getPresignedDownloadUrl } from "@/lib/r2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; salaryRecordId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, salaryRecordId } = await params;
  const detail = await getMonthDetail(salaryRecordId, effective.agentId);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (detail.dispatcher.id !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = monthDetailFilename(
    detail.year,
    detail.month,
    detail.dispatcher.name,
    "pdf",
  );
  const cacheKey = pdfKey(
    effective.agentId,
    detail.year,
    detail.month,
    salaryRecordId,
  );

  // Cache hit — redirect the browser straight to R2 via a presigned URL so
  // the bytes never flow through this function. This is the hot path after
  // the prewarm pipeline runs.
  const hit = await hasCached(cacheKey).catch((err) => {
    console.error("[pdf-cache] head failed:", err);
    return false;
  });
  if (hit) {
    const url = await getPresignedDownloadUrl(cacheKey, {
      filename,
      disposition: download ? "attachment" : "inline",
      contentType: "application/pdf",
    });
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "x-payroll-cache": "hit" },
    });
  }

  // Miss — generate, stream to client, write-through to cache async.
  const weightTiers = ((detail.weightTiersSnapshot ?? []) as unknown) as WeightTierSnapshot[];
  const bonusTierSnapshot = readBonusTierSnapshot(detail.bonusTierSnapshot);
  const bonusTiers = (bonusTierSnapshot?.tiers ?? undefined) as BonusTierSnapshotRow[] | undefined;
  const tierBreakdown = buildTierBreakdown(detail.lineItems, weightTiers, bonusTiers);

  let pdf: Buffer;
  try {
    pdf = await generateMonthDetailPdf({
      dispatcher: {
        name: detail.dispatcher.name,
        extId: detail.dispatcher.extId,
        branchCode: detail.dispatcher.branchCode,
      },
      month: detail.month,
      year: detail.year,
      totals: detail.totals,
      orderThreshold: bonusTierSnapshot?.orderThreshold ?? 2000,
      tierBreakdown,
      lineItems: detail.lineItems.map((li) => ({
        deliveryDate: li.deliveryDate,
        waybillNumber: li.waybillNumber,
        weight: li.weight,
        isBonusTier: li.isBonusTier,
      })),
    });
  } catch (error) {
    console.error("[month-detail pdf] generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF. Please try again." },
      { status: 500 },
    );
  }

  // Fire-and-forget write-through. The response doesn't wait on this, but
  // Node keeps the Lambda alive until the in-flight Promise resolves (the
  // R2 PUT is ~300-800 ms for a 500 KB PDF). Failures are logged, never
  // surfaced to the user — worst case the next click regenerates.
  putCached(cacheKey, pdf, "application/pdf").catch((err) =>
    console.error("[pdf-cache] write failed:", err),
  );

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "x-payroll-cache": "miss",
    },
  });
}
