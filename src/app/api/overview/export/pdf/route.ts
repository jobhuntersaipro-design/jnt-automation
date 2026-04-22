import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import {
  getDispatcherExportData,
  getBranchExportData,
} from "@/lib/db/overview-export";
import type { Filters } from "@/lib/db/overview";
import { renderSummaryTablePdf } from "@/lib/pdf/summary-table";

function fmt(n: number): string {
  return n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function GET(req: NextRequest) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "dispatcher";

  const now = new Date();
  let defaultToMonth = now.getMonth();
  let defaultToYear = now.getFullYear();
  if (defaultToMonth === 0) {
    defaultToMonth = 12;
    defaultToYear--;
  }
  let defaultFromMonth = defaultToMonth - 2;
  let defaultFromYear = defaultToYear;
  if (defaultFromMonth <= 0) {
    defaultFromMonth += 12;
    defaultFromYear--;
  }

  const filters: Filters = {
    selectedBranchCodes:
      searchParams.get("branches")?.split(",").filter(Boolean) ?? [],
    fromMonth: Number(searchParams.get("fromMonth") ?? defaultFromMonth),
    fromYear: Number(searchParams.get("fromYear") ?? defaultFromYear),
    toMonth: Number(searchParams.get("toMonth") ?? defaultToMonth),
    toYear: Number(searchParams.get("toYear") ?? defaultToYear),
  };

  const period = `${filters.fromMonth}/${filters.fromYear} – ${filters.toMonth}/${filters.toYear}`;
  const generatedAt = new Date().toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (type === "branch") {
    const rows = await getBranchExportData(effective.agentId, filters);
    const pdf = await renderSummaryTablePdf({
      title: "Branch performance",
      subtitle: period,
      meta: [
        `${rows.length} row${rows.length === 1 ? "" : "s"}`,
        `Generated ${generatedAt}`,
      ],
      columns: [
        { label: "Branch", flex: 1 },
        { label: "Month", flex: 1 },
        { label: "Dispatchers", flex: 1, align: "right", tabular: true },
        { label: "Total Orders", flex: 1.2, align: "right", tabular: true },
        { label: "Net Payout (RM)", flex: 1.5, align: "right", tabular: true },
      ],
      rows: rows.map((r) => [
        r.branch,
        r.month,
        String(r.dispatcherCount),
        String(r.totalOrders),
        fmt(r.totalNetPayout),
      ]),
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="overview_branch_performance.pdf"`,
      },
    });
  }

  const rows = await getDispatcherExportData(effective.agentId, filters);
  const pdf = await renderSummaryTablePdf({
    title: "Dispatcher performance",
    subtitle: period,
    meta: [
      `${rows.length} row${rows.length === 1 ? "" : "s"}`,
      `Generated ${generatedAt}`,
    ],
    columns: [
      { label: "Dispatcher", flex: 2.2 },
      { label: "Month", flex: 1 },
      { label: "Branch", flex: 0.9 },
      { label: "Orders", flex: 0.9, align: "right", tabular: true },
      { label: "Base", flex: 1.1, align: "right", tabular: true },
      { label: "Incentive", flex: 1.1, align: "right", tabular: true },
      { label: "Petrol", flex: 1.1, align: "right", tabular: true },
      { label: "Penalty", flex: 1, align: "right", tabular: true },
      { label: "Advance", flex: 1, align: "right", tabular: true },
      { label: "Net (RM)", flex: 1.3, align: "right", tabular: true },
    ],
    rows: rows.map((r) => [
      r.name,
      r.month,
      r.branch,
      String(r.totalOrders),
      fmt(r.baseSalary),
      fmt(r.incentive),
      fmt(r.petrolSubsidy),
      fmt(r.penalty),
      fmt(r.advance),
      fmt(r.netSalary),
    ]),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="overview_dispatcher_performance.pdf"`,
    },
  });
}
