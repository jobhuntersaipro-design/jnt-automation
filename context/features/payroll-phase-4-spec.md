# Payroll Page — Phase 4: Export (CSV + Google Sheets)

## Overview

Add export functionality to the payroll history list and salary table view.
Agent can export monthly salary data as CSV (instant) or push to Google Sheets
(one-time OAuth per agent). Export available from both the history list and
the individual salary table page.

## Expected Outcome

After this phase:
- "Export CSV" downloads salary data instantly, no setup needed
- "Export Google Sheets" pushes data to a new Google Sheet
- Google OAuth requested once per agent, tokens stored in DB
- Agent can re-export any confirmed month at any time
- "Disconnect Google Sheets" option in Settings page

---

## Export Entry Points

### From History List (`/payroll`)
Export dropdown per history row:
```
[View]  [Export ▾]
          → Export CSV
          → Export to Google Sheets
```

### From Salary Table (`/payroll/[uploadId]`)
Export buttons in page header alongside "Upload new data":
```
[↓ Export CSV]   [↗ Export to Google Sheets]
```

---

## CSV Export

No setup required — instant download.

### `GET /api/payroll/[uploadId]/export/csv`

**CSV format:**
```
Dispatcher ID,Dispatcher Name,Branch,Total Orders,Base Salary,Incentive,Petrol Subsidy,Penalty,Advance,Net Salary
KEP-D001,Ahmad Faizal,KPG001,2450,3800.00,300.00,120.00,0.00,0.00,4220.00
KEP-D002,Nurul Aina,KPG001,2210,3420.00,280.00,105.00,0.00,0.00,3805.00
TOTAL,,,,XX,XX,XX,XX,XX,XX
```

**Response headers:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="payroll_KPG001_03_2026.csv"
```

File naming: `payroll_[branchCode]_[month]_[year].csv`

---

## Google Sheets Export

### What You Need to Set Up (Developer — One Time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Sheets API** + **Google Drive API**
3. Create OAuth 2.0 credentials (Web application type)
4. Add authorised redirect URI:
   `https://easystaff.top/api/auth/google-sheets/callback`
5. Add to `.env`:

```env
GOOGLE_SHEETS_CLIENT_ID=
GOOGLE_SHEETS_CLIENT_SECRET=
GOOGLE_SHEETS_REDIRECT_URI=https://easystaff.top/api/auth/google-sheets/callback
```

### DB Changes

```prisma
model Agent {
  // ... existing fields ...
  googleSheetsAccessToken   String?
  googleSheetsRefreshToken  String?
  googleSheetsTokenExpiry   DateTime?
}
```

```bash
npx prisma migrate dev --name add-google-sheets-tokens
```

### Agent OAuth Flow (One-time per agent)

1. Agent clicks "Export to Google Sheets"
2. System checks for valid token → none found
3. Redirects to:
   ```
   GET /api/auth/google-sheets/connect
   → Redirects to Google OAuth with scopes:
     spreadsheets + drive.file
   ```
4. Agent approves → Google redirects to:
   ```
   GET /api/auth/google-sheets/callback?code=xxx
   → Exchange code for tokens
   → Store on Agent row
   → Redirect back to /payroll with toast "Google Sheets connected"
   ```
5. Agent clicks "Export to Google Sheets" again → export proceeds

### Token Refresh

```ts
async function getValidAccessToken(agentId: string): Promise<string> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent.googleSheetsAccessToken) throw new Error("Not connected");

  if (agent.googleSheetsTokenExpiry < new Date()) {
    const refreshed = await refreshGoogleToken(agent.googleSheetsRefreshToken!);
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        googleSheetsAccessToken: refreshed.access_token,
        googleSheetsTokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }
  return agent.googleSheetsAccessToken;
}
```

### Export Flow

`POST /api/payroll/[uploadId]/export/sheets`

1. Get valid access token
2. Create new Google Sheet:
   ```
   Title: "EasyStaff Payroll — KPG001 March 2026"
   ```
3. Write headers + data rows + TOTAL row
4. Format: bold headers, auto-resize columns
5. Return spreadsheet URL
6. Toast: "Exported to Google Sheets" with link to open

---

## API Routes

### `GET /api/payroll/[uploadId]/export/csv`
Generate + return CSV.

### `POST /api/payroll/[uploadId]/export/sheets`
Export to Google Sheets. Returns `{ spreadsheetUrl: string }`.

### `GET /api/auth/google-sheets/connect`
Start OAuth — redirect to Google.

### `GET /api/auth/google-sheets/callback`
Handle callback — store tokens.

### `DELETE /api/auth/google-sheets/disconnect`
Clear stored tokens from Agent row.

---

## Settings Page — Google Sheets Section

Add to existing Settings page:

```
Google Sheets
Connected as: jobhunters.ai.pro@gmail.com   [Disconnect]
```

Or if not connected:
```
Google Sheets
Not connected.   [Connect Google Sheets]
```

---

## Files to Create

| File | Action |
|---|---|
| `src/lib/payroll/csv-generator.ts` | Create — CSV string builder |
| `src/lib/google-sheets.ts` | Create — Sheets API client + token management |
| `src/app/api/payroll/[uploadId]/export/csv/route.ts` | Create |
| `src/app/api/payroll/[uploadId]/export/sheets/route.ts` | Create |
| `src/app/api/auth/google-sheets/connect/route.ts` | Create |
| `src/app/api/auth/google-sheets/callback/route.ts` | Create |
| `src/app/api/auth/google-sheets/disconnect/route.ts` | Create |
| `src/components/payroll/export-buttons.tsx` | Create — CSV + Sheets buttons |
| `src/components/settings/google-sheets-section.tsx` | Create |

---

## Testing

### CSV
1. Click "Export CSV" → file downloads immediately
2. Headers correct
3. All dispatcher rows with correct values
4. TOTAL row at bottom
5. File named `payroll_[branchCode]_[month]_[year].csv`

### Google Sheets
6. First click → redirects to Google OAuth
7. After consent → redirect back with "Google Sheets connected" toast
8. Second click → sheet created, URL in toast
9. Sheet title: "EasyStaff Payroll — [Branch] [Month] [Year]"
10. Header row bold, columns auto-sized
11. All data rows correct, TOTAL row at bottom
12. Expired token → auto-refreshed, export proceeds
13. Revoked Google access → error: "Google Sheets connection lost. Reconnect in Settings."
14. Settings shows connected account + Disconnect button
15. Disconnect → tokens cleared, next export prompts OAuth

## Status

Not started. Complete Phase 3 first.
