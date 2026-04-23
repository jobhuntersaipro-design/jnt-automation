import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getDispatcherExportData, getBranchExportData } from "@/lib/db/overview-export";
import { generateDispatcherCSV, generateBranchCSV } from "@/lib/overview/csv-generator";
import type { Filters } from "@/lib/db/overview";

export async function GET(req: NextRequest) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "dispatcher"; // "dispatcher" | "branch"

  const now = new Date();
  let defaultToMonth = now.getMonth();
  let defaultToYear = now.getFullYear();
  if (defaultToMonth === 0) { defaultToMonth = 12; defaultToYear--; }
  let defaultFromMonth = defaultToMonth - 2;
  let defaultFromYear = defaultToYear;
  if (defaultFromMonth <= 0) { defaultFromMonth += 12; defaultFromYear--; }

  const filters: Filters = {
    selectedBranchCodes: searchParams.get("branches")?.split(",").filter(Boolean) ?? [],
    fromMonth: Number(searchParams.get("fromMonth") ?? defaultFromMonth),
    fromYear: Number(searchParams.get("fromYear") ?? defaultFromYear),
    toMonth: Number(searchParams.get("toMonth") ?? defaultToMonth),
    toYear: Number(searchParams.get("toYear") ?? defaultToYear),
  };

  let csv: string;
  let fileName: string;

  if (type === "branch") {
    const rows = await getBranchExportData(effective.agentId, filters);
    csv = generateBranchCSV(rows);
    fileName = "overview_branch_performance.csv";
  } else {
    const rows = await getDispatcherExportData(effective.agentId, filters);
    csv = generateDispatcherCSV(rows);
    fileName = "overview_dispatcher_performance.csv";
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      // Matches the 5-min overview data cache — repeat clicks within the
      // window reuse the browser's copy. `private` because the CSV is
      // agent-scoped and must not land in a shared cache.
      "Cache-Control": "private, max-age=60",
    },
  });
}
