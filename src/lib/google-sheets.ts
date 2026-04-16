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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Create a Google Sheet with payroll data and return the spreadsheet URL.
 */
export async function exportToGoogleSheets(
  accessToken: string,
  branchCode: string,
  month: number,
  year: number,
  records: SheetRow[],
): Promise<string> {
  const title = `EasyStaff Payroll — ${branchCode} ${MONTH_NAMES[month - 1]} ${year}`;

  // 1. Create spreadsheet
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "Payroll" } }],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create spreadsheet: ${err}`);
  }

  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const sheetId = spreadsheet.sheets[0].properties.sheetId;

  // 2. Build values
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

  const values = [headers, ...dataRows, totalRow];

  // 3. Write values
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Payroll!A1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );

  // 4. Format: bold header row + auto-resize columns
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
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                },
              },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: values.length - 1,
                endRowIndex: values.length,
              },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                },
              },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: 10,
              },
            },
          },
        ],
      }),
    },
  );

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
