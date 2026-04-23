import { redirect } from "next/navigation";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getMonthDetail } from "@/lib/db/staff";
import {
  buildTierBreakdown,
  type BonusTierSnapshotRow,
  type WeightTierSnapshot,
} from "@/lib/staff/month-detail";
import { readBonusTierSnapshot } from "@/lib/staff/bonus-tier-snapshot";
import { MonthDetailClient } from "@/components/staff/month-detail-client";

export default async function DispatcherMonthDetailPage({
  params,
}: {
  params: Promise<{ salaryRecordId: string }>;
}) {
  const effective = await getEffectiveAgentId();
  if (!effective) redirect("/auth/login");

  const { salaryRecordId } = await params;
  const detail = await getMonthDetail(salaryRecordId, effective.agentId);
  if (!detail) redirect("/dispatchers");

  const weightTiers = ((detail.weightTiersSnapshot ?? []) as unknown) as WeightTierSnapshot[];
  const bonusTierSnapshot = readBonusTierSnapshot(detail.bonusTierSnapshot);
  const bonusTiers = (bonusTierSnapshot?.tiers ?? undefined) as BonusTierSnapshotRow[] | undefined;
  const tierBreakdown = buildTierBreakdown(detail.lineItems, weightTiers, bonusTiers);

  return (
    <main className="flex-1 overflow-y-auto px-4 lg:px-16 py-6 lg:py-8">
      <MonthDetailClient
        salaryRecordId={detail.salaryRecordId}
        dispatcher={detail.dispatcher}
        month={detail.month}
        year={detail.year}
        totals={detail.totals}
        orderThreshold={bonusTierSnapshot?.orderThreshold ?? 2000}
        tierBreakdown={tierBreakdown}
        lineItems={detail.lineItems.map((li) => ({
          deliveryDate: li.deliveryDate ? li.deliveryDate.toISOString() : null,
          waybillNumber: li.waybillNumber,
          weight: li.weight,
          commission: li.commission,
          isBonusTier: li.isBonusTier,
        }))}
      />
    </main>
  );
}
