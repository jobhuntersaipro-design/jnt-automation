import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getEffectiveAgentId } from "@/lib/impersonation";
import {
  getDispatcherExportData,
  getBranchExportData,
} from "@/lib/db/overview-export";
import type { Filters } from "@/lib/db/overview";
import { renderSummaryTablePdf } from "@/lib/pdf/summary-table";

const redis = Redis.fromEnv();
const PDF_CACHE_TTL = 5 * 60; // match overview-cached data TTL

function fmt(n: number): string {
  return n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pdfCacheKey(agentId: string, type: string, filters: Filters): string {
  const sortedBranches = [...filters.selectedBranchCodes].sort().join(",");
  return `overview-pdf:${agentId}:${type}:${filters.fromMonth}-${filters.fromYear}:${filters.toMonth}-${filters.toYear}:${sortedBranches}`;
}

async function readPdfCache(key: string): Promise<Uint8Array | null> {
  try {
    const b64 = await redis.get<string>(key);
    if (!b64) return null;
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

async function writePdfCache(key: string, bytes: Uint8Array): Promise<void> {
  try {
    const b64 = Buffer.from(bytes).toString("base64");
    await redis.set(key, b64, { ex: PDF_CACHE_TTL });
  } catch {
    // Caching is best-effort — a Redis outage must not break downloads
  }
}

function pdfResponse(bytes: Uint8Array, filename: string): NextResponse {
  // Re-wrap into a fresh Uint8Array so the NextResponse BodyInit overload
  // matches — Uint8Array<ArrayBufferLike> isn't directly assignable, but
  // a new ArrayBuffer-backed view is.
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Browsers can reuse the blob on repeat clicks without a round-trip
      "Cache-Control": `private, max-age=${PDF_CACHE_TTL}`,
    },
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

  // Serve rendered PDFs from Redis when available — @react-pdf/renderer is
  // CPU-bound (100–500 ms). A repeat click on Download within the 5-min
  // overview data TTL reuses the prior render.
  const cacheKey = pdfCacheKey(effective.agentId, type, filters);
  const cached = await readPdfCache(cacheKey);
  if (cached) {
    const filename =
      type === "branch"
        ? "overview_branch_performance.pdf"
        : "overview_dispatcher_performance.pdf";
    return pdfResponse(cached, filename);
  }

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
    const bytes = new Uint8Array(pdf);
    await writePdfCache(cacheKey, bytes);
    return pdfResponse(bytes, "overview_branch_performance.pdf");
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
      { label: "Bonus Tier", flex: 1.1, align: "right", tabular: true },
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
      fmt(r.bonusTierEarnings),
      fmt(r.petrolSubsidy),
      fmt(r.penalty),
      fmt(r.advance),
      fmt(r.netSalary),
    ]),
  });

  const bytes = new Uint8Array(pdf);
  await writePdfCache(cacheKey, bytes);
  return pdfResponse(bytes, "overview_dispatcher_performance.pdf");
}
