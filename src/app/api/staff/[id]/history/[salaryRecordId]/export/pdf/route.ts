import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getMonthDetail } from "@/lib/db/staff";
import { buildTierBreakdown, type WeightTierSnapshot } from "@/lib/staff/month-detail";
import { generateMonthDetailPdf } from "@/lib/staff/month-detail-pdf";
import { monthDetailFilename } from "@/lib/staff/month-detail-filename";

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

  const tiers = ((detail.weightTiersSnapshot ?? []) as unknown) as WeightTierSnapshot[];
  const tierBreakdown = buildTierBreakdown(detail.lineItems, tiers);

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
      tierBreakdown,
      lineItems: detail.lineItems.map((li) => ({
        deliveryDate: li.deliveryDate,
        waybillNumber: li.waybillNumber,
        weight: li.weight,
      })),
    });
  } catch (error) {
    console.error("[month-detail pdf] generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF. Please try again." },
      { status: 500 },
    );
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = monthDetailFilename(
    detail.year,
    detail.month,
    detail.dispatcher.name,
    "pdf",
  );

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
