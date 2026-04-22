import { prisma } from "@/lib/prisma";

/**
 * Get a valid Google Sheets access token for the agent.
 * Auto-refreshes if expired.
 */
export async function getValidAccessToken(agentId: string): Promise<string> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      googleSheetsAccessToken: true,
      googleSheetsRefreshToken: true,
      googleSheetsTokenExpiry: true,
    },
  });

  if (!agent?.googleSheetsAccessToken) {
    throw new Error("NOT_CONNECTED");
  }

  // If token is still valid (with 60s buffer), return it
  if (agent.googleSheetsTokenExpiry && agent.googleSheetsTokenExpiry > new Date(Date.now() + 60_000)) {
    return agent.googleSheetsAccessToken;
  }

  // Token expired — refresh it
  if (!agent.googleSheetsRefreshToken) {
    throw new Error("NOT_CONNECTED");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_SHEETS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_SHEETS_CLIENT_SECRET!,
      refresh_token: agent.googleSheetsRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // Refresh token revoked or invalid
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        googleSheetsAccessToken: null,
        googleSheetsRefreshToken: null,
        googleSheetsTokenExpiry: null,
      },
    });
    throw new Error("TOKEN_REVOKED");
  }

  const tokens = await res.json();

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      googleSheetsAccessToken: tokens.access_token,
      googleSheetsTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });

  return tokens.access_token;
}

interface SheetRow {
  extId: string;
  name: string;
  branchCode: string;
  totalOrders: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  penalty: number;
  advance: number;
  netSalary: number;
}

interface DispatcherLineItem {
  orderDate: string;
  waybillNumber: string;
  dispatcherName: string;
  weight: number;
}

interface DispatcherTab {
  name: string;
  lineItems: DispatcherLineItem[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Sanitize sheet title — Google Sheets forbids: * : / \ ? [ ]
 * and limits to 100 characters.
 */
function sanitizeSheetTitle(name: string): string {
  return name.replace(/[*:/\\?[\]]/g, " ").trim().slice(0, 100);
}

/**
 * Create a Google Sheet with payroll data and return the spreadsheet URL.
 * Includes a summary "Payroll" tab and per-dispatcher tabs with line items.
 */
export async function exportToGoogleSheets(
  accessToken: string,
  branchCode: string,
  month: number,
  year: number,
  records: SheetRow[],
  dispatcherTabs?: DispatcherTab[],
): Promise<string> {
  const title = `EasyStaff Payroll — ${branchCode} ${MONTH_NAMES[month - 1]} ${year}`;

  // Build sheet definitions: summary + per-dispatcher tabs
  const sheetDefs: { properties: { title: string; sheetId: number } }[] = [
    { properties: { title: "Payroll", sheetId: 0 } },
  ];

  if (dispatcherTabs) {
    dispatcherTabs.forEach((tab, i) => {
      sheetDefs.push({
        properties: {
          title: sanitizeSheetTitle(tab.name),
          sheetId: i + 1,
        },
      });
    });
  }

  // 1. Create spreadsheet with all sheets
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: sheetDefs,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create spreadsheet: ${err}`);
  }

  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;

  // 2. Build summary tab values
  const headers = [
    "Dispatcher ID", "Dispatcher Name", "Branch", "Total Orders",
    "Base Salary (RM)", "Incentive (RM)", "Petrol Subsidy (RM)", "Penalty (RM)", "Advance (RM)", "Net Salary (RM)",
  ];

  const dataRows = records.map((r) => [
    r.extId, r.name, r.branchCode, r.totalOrders,
    r.baseSalary, r.incentive, r.petrolSubsidy,
    r.penalty, r.advance, r.netSalary,
  ]);

  const totals = records.reduce(
    (acc, r) => ({
      totalOrders: acc.totalOrders + r.totalOrders,
      baseSalary: acc.baseSalary + r.baseSalary,
      incentive: acc.incentive + r.incentive,
      petrolSubsidy: acc.petrolSubsidy + r.petrolSubsidy,
      penalty: acc.penalty + r.penalty,
      advance: acc.advance + r.advance,
      netSalary: acc.netSalary + r.netSalary,
    }),
    { totalOrders: 0, baseSalary: 0, incentive: 0, petrolSubsidy: 0, penalty: 0, advance: 0, netSalary: 0 },
  );

  const totalRow = [
    "TOTAL", "", "", totals.totalOrders,
    totals.baseSalary, totals.incentive, totals.petrolSubsidy,
    totals.penalty, totals.advance, totals.netSalary,
  ];

  const summaryValues = [headers, ...dataRows, totalRow];

  // 3. Build per-dispatcher tab values
  const tabData: { range: string; values: (string | number)[][] }[] = [
    { range: "Payroll!A1", values: summaryValues },
  ];

  if (dispatcherTabs) {
    for (const tab of dispatcherTabs) {
      const tabHeaders = ["Order Date", "Waybill Number", "Dispatcher Name", "Weight (kg)"];
      const tabRows = tab.lineItems.map((li) => [
        li.orderDate,
        li.waybillNumber,
        li.dispatcherName,
        li.weight,
      ]);
      const sheetTitle = sanitizeSheetTitle(tab.name);
      tabData.push({
        range: `'${sheetTitle}'!A1`,
        values: [tabHeaders, ...tabRows],
      });
    }
  }

  // 4. Write all values in one batch
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: tabData,
      }),
    },
  );

  // 5. Format: bold headers + auto-resize on all sheets
  const formatRequests: Record<string, unknown>[] = [];

  for (const def of sheetDefs) {
    const sid = def.properties.sheetId;
    // Bold header row
    formatRequests.push({
      repeatCell: {
        range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    });
    // Auto-resize columns
    formatRequests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId: sid,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: sid === 0 ? 10 : 4,
        },
      },
    });
  }

  // Bold totals row on summary sheet
  formatRequests.push({
    repeatCell: {
      range: {
        sheetId: 0,
        startRowIndex: summaryValues.length - 1,
        endRowIndex: summaryValues.length,
      },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat.bold",
    },
  });

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests: formatRequests }),
    },
  );

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

interface DispatcherHistoryRow {
  month: number;
  year: number;
  totalOrders: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  petrolQualifyingDays: number;
  penalty: number;
  advance: number;
  netSalary: number;
  wasRecalculated: boolean;
}

/**
 * Export a single dispatcher's salary history to a Google Sheet.
 * One row per month with all salary fields.
 */
export async function exportDispatcherHistoryToSheets(
  accessToken: string,
  dispatcher: { name: string; extId: string; branchCode: string },
  rows: DispatcherHistoryRow[],
): Promise<string> {
  const title = `EasyStaff History — ${dispatcher.name} (${dispatcher.extId})`;

  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "History", sheetId: 0 } }],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create spreadsheet: ${err}`);
  }

  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;

  const metaRows: (string | number)[][] = [
    ["Dispatcher", dispatcher.name],
    ["Dispatcher ID", dispatcher.extId],
    ["Branch", dispatcher.branchCode],
    [""],
  ];

  const headers = [
    "Month", "Year", "Total Orders",
    "Base Salary (RM)", "Incentive (RM)",
    "Petrol Subsidy (RM)", "Qualifying Days",
    "Penalty (RM)", "Advance (RM)",
    "Net Salary (RM)", "Status",
  ];

  const dataRows = rows.map((r) => [
    MONTH_NAMES[r.month - 1],
    r.year,
    r.totalOrders,
    r.baseSalary,
    r.incentive,
    r.petrolSubsidy,
    r.petrolQualifyingDays,
    r.penalty,
    r.advance,
    r.netSalary,
    r.wasRecalculated ? "Recalculated" : (r.netSalary <= 0 || r.totalOrders === 0) ? "Review" : "Confirmed",
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      totalOrders: acc.totalOrders + r.totalOrders,
      baseSalary: acc.baseSalary + r.baseSalary,
      incentive: acc.incentive + r.incentive,
      petrolSubsidy: acc.petrolSubsidy + r.petrolSubsidy,
      petrolQualifyingDays: acc.petrolQualifyingDays + r.petrolQualifyingDays,
      penalty: acc.penalty + r.penalty,
      advance: acc.advance + r.advance,
      netSalary: acc.netSalary + r.netSalary,
    }),
    { totalOrders: 0, baseSalary: 0, incentive: 0, petrolSubsidy: 0, petrolQualifyingDays: 0, penalty: 0, advance: 0, netSalary: 0 },
  );

  const totalRow = [
    "TOTAL", "", totals.totalOrders,
    totals.baseSalary, totals.incentive,
    totals.petrolSubsidy, totals.petrolQualifyingDays,
    totals.penalty, totals.advance,
    totals.netSalary, "",
  ];

  const values = [...metaRows, headers, ...dataRows, totalRow];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: [{ range: "History!A1", values }],
      }),
    },
  );

  const headerRowIndex = metaRows.length;

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          // Bold meta labels
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: metaRows.length - 1, startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          // Bold header row
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: headerRowIndex, endRowIndex: headerRowIndex + 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          // Bold TOTAL row
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: values.length - 1, endRowIndex: values.length },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          // Auto-resize columns
          {
            autoResizeDimensions: {
              dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: headers.length },
            },
          },
        ],
      }),
    },
  );

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
