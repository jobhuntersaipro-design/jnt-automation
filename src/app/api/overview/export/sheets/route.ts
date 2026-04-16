import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getDispatcherExportData, getBranchExportData } from "@/lib/db/overview-export";
import { getValidAccessToken } from "@/lib/google-sheets";
import type { Filters } from "@/lib/db/overview";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const filters: Filters = {
    selectedBranchCodes: body.branches ?? [],
    fromMonth: body.fromMonth,
    fromYear: body.fromYear,
    toMonth: body.toMonth,
    toYear: body.toYear,
  };

  // Use real session user for Google Sheets tokens (not impersonated agent)
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "NOT_CONNECTED" || msg === "TOKEN_REVOKED") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    throw err;
  }

  const fromLabel = `${MONTH_NAMES[filters.fromMonth - 1]} ${filters.fromYear}`;
  const toLabel = `${MONTH_NAMES[filters.toMonth - 1]} ${filters.toYear}`;
  const title = `EasyStaff Overview — ${fromLabel} to ${toLabel}`;

  // Create spreadsheet with two sheets
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: "Dispatcher Performance", index: 0 } },
        { properties: { title: "Branch Summary", index: 1 } },
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    return NextResponse.json(
      { error: `Failed to create spreadsheet: ${err}` },
      { status: 502 },
    );
  }

  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const dispatcherSheetId = spreadsheet.sheets[0].properties.sheetId;
  const branchSheetId = spreadsheet.sheets[1].properties.sheetId;

  // Fetch data
  const [dispatcherRows, branchRows] = await Promise.all([
    getDispatcherExportData(effective.agentId, filters),
    getBranchExportData(effective.agentId, filters),
  ]);

  // Build dispatcher values
  const dispatcherHeaders = [
    "Name", "Month", "Branch", "Total Orders",
    "Base Salary (RM)", "Incentive (RM)", "Petrol Subsidy (RM)", "Penalty (RM)", "Advance (RM)", "Net Salary (RM)",
    "T1 Range (kg)", "T1 Rate (RM)", "T2 Range (kg)", "T2 Rate (RM)", "T3 Range (kg)", "T3 Rate (RM)",
    "Incentive Threshold (orders)", "Incentive Amount (RM)",
    "Petrol Eligible", "Petrol Threshold (orders/day)", "Petrol Amount (RM/day)",
  ];
  const dispatcherData = dispatcherRows.map((r) => [
    r.name, r.month, r.branch, r.totalOrders,
    r.baseSalary, r.incentive, r.petrolSubsidy, r.penalty, r.advance, r.netSalary,
    r.t1Range, r.t1Rate, r.t2Range, r.t2Rate, r.t3Range, r.t3Rate,
    r.incentiveThreshold, r.incentiveAmount,
    r.petrolEligible ? "Yes" : "No", r.petrolThreshold, r.petrolAmount,
  ]);
  const dispatcherValues = [dispatcherHeaders, ...dispatcherData];

  // Build branch values
  const branchHeaders = [
    "Branch", "Month", "Dispatcher Count", "Total Orders", "Total Net Payout (RM)",
  ];
  const branchData = branchRows.map((r) => [
    r.branch, r.month, r.dispatcherCount, r.totalOrders, r.totalNetPayout,
  ]);
  const branchValues = [branchHeaders, ...branchData];

  // Write both sheets + format in parallel
  await Promise.all([
    fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Dispatcher Performance'!A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: dispatcherValues }),
      },
    ),
    fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Branch Summary'!A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: branchValues }),
      },
    ),
  ]);

  // Format: bold headers + auto-resize
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: dispatcherSheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId: dispatcherSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 21 },
            },
          },
          {
            repeatCell: {
              range: { sheetId: branchSheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId: branchSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 5 },
            },
          },
        ],
      }),
    },
  );

  return NextResponse.json({
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  });
}
