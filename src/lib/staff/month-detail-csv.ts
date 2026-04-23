import { escapeCsv } from "@/lib/csv";
import type { MonthDetail } from "@/lib/db/staff";
import type { TierBreakdown, TierBreakdownRow } from "./month-detail";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tierSection(label: string, rows: TierBreakdownRow[]): string[] {
  const lines: string[] = [];
  lines.push(label);
  lines.push(
    ["Tier", "Range", "Rate (RM)", "Orders", "Total Weight (kg)", "Subtotal (RM)"].join(","),
  );
  for (const t of rows) {
    lines.push(
      [
        t.tier,
        t.range,
        t.commission.toFixed(2),
        t.orderCount,
        t.totalWeight.toFixed(2),
        t.subtotal.toFixed(2),
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return lines;
}

/**
 * Render a dispatcher's month detail as a CSV string.
 *
 * Layout:
 * - Meta header (dispatcher, ID, branch, month)
 * - Parcel rows: Business Date, AWB No., Dispatcher Name, Billing Weight, Type (Base/Bonus)
 * - TOTAL row
 * - Base Tier Breakdown section
 * - Bonus Tier Breakdown section (only when the dispatcher crossed the threshold)
 */
export function generateMonthDetailCsv(
  detail: MonthDetail,
  tierBreakdown: TierBreakdown,
): string {
  const lines: string[] = [];
  lines.push(`Dispatcher,${escapeCsv(detail.dispatcher.name)}`);
  lines.push(`Dispatcher ID,${escapeCsv(detail.dispatcher.extId)}`);
  lines.push(`Branch,${escapeCsv(detail.dispatcher.branchCode)}`);
  lines.push(
    `Month,${escapeCsv(`${MONTH_NAMES[detail.month - 1]} ${detail.year}`)}`,
  );
  lines.push("");
  lines.push(
    ["Business Date", "AWB No.", "Dispatcher Name", "Billing Weight (kg)", "Type"].join(","),
  );

  for (const li of detail.lineItems) {
    lines.push(
      [
        formatDate(li.deliveryDate),
        li.waybillNumber,
        detail.dispatcher.name,
        li.weight.toFixed(2),
        li.isBonusTier ? "Bonus Tier" : "Base",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  lines.push(
    ["TOTAL", "", "", detail.totals.totalWeight.toFixed(2), ""].map(escapeCsv).join(","),
  );

  lines.push("");
  lines.push(...tierSection("Base Tier Breakdown", tierBreakdown.base));

  if (tierBreakdown.bonusTierEarnings.length > 0) {
    lines.push("");
    lines.push(...tierSection("Bonus Tier Breakdown (post-threshold)", tierBreakdown.bonusTierEarnings));
  }

  return lines.join("\n");
}
