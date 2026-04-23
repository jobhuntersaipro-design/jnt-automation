import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getMonthDetail } from "@/lib/db/staff";
import {
  buildTierBreakdown,
  type BonusTierSnapshotRow,
  type WeightTierSnapshot,
} from "@/lib/staff/month-detail";
import { readBonusTierSnapshot } from "@/lib/staff/bonus-tier-snapshot";
import { generateMonthDetailCsv } from "@/lib/staff/month-detail-csv";
import { monthDetailFilename } from "@/lib/staff/month-detail-filename";

export async function GET(
  _req: NextRequest,
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

  const weightTiers = ((detail.weightTiersSnapshot ?? []) as unknown) as WeightTierSnapshot[];
  const bonusTierSnapshot = readBonusTierSnapshot(detail.bonusTierSnapshot);
  const bonusTiers = (bonusTierSnapshot?.tiers ?? undefined) as BonusTierSnapshotRow[] | undefined;
  const tierBreakdown = buildTierBreakdown(detail.lineItems, weightTiers, bonusTiers);
  const csv = generateMonthDetailCsv(detail, tierBreakdown);
  const filename = monthDetailFilename(
    detail.year,
    detail.month,
    detail.dispatcher.name,
    "csv",
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
