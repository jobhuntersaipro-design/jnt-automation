/**
 * Diagnostic script: parse the data/*.xlsx files with the same logic the app uses,
 * and report what the detect-route checks would see. Helps pinpoint why uploads fail.
 *
 * Run:  npx tsx scripts/diagnose-upload.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";

interface ParsedRow {
  waybillNumber: string;
  branchName: string;
  deliveryDate: Date | null;
  dispatcherId: string;
  dispatcherName: string;
  billingWeight: number;
}

function cellToString(cell: ExcelJS.Cell): string {
  if (cell.value == null) return "";
  return String(cell.value).trim();
}

function cellToDate(cell: ExcelJS.Cell): Date | null {
  if (cell.value == null) return null;
  if (cell.value instanceof Date) return cell.value;
  if (typeof cell.value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + cell.value * 86400000);
  }
  const parsed = new Date(String(cell.value));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function cellToWeight(cell: ExcelJS.Cell): number {
  if (cell.value == null) return 0;
  if (typeof cell.value === "number") return cell.value;
  const cleaned = String(cell.value).replace(/[^0-9.]/g, "");
  const weight = parseFloat(cleaned);
  return isNaN(weight) ? 0 : weight;
}

async function sanitizeWorkbookSheetNames(buffer: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const wbFile = zip.file("xl/workbook.xml");
  if (!wbFile) return buffer;
  const wbXml = await wbFile.async("string");
  const sheetTagRe = /<sheet\b[^>]*\/>/g;
  const tags = wbXml.match(sheetTagRe);
  if (!tags || tags.length < 2) return buffer;
  const seen = new Map<string, number>();
  let hasCollision = false;
  for (const tag of tags) {
    const nameMatch = tag.match(/\bname="([^"]*)"/);
    if (!nameMatch) continue;
    const lower = nameMatch[1].toLowerCase();
    const count = seen.get(lower) ?? 0;
    if (count > 0) hasCollision = true;
    seen.set(lower, count + 1);
  }
  if (!hasCollision) return buffer;
  const usedNames = new Set<string>();
  const newXml = wbXml.replace(sheetTagRe, (tag) => {
    const nameMatch = tag.match(/\bname="([^"]*)"/);
    if (!nameMatch) return tag;
    const original = nameMatch[1];
    const lower = original.toLowerCase();
    if (!usedNames.has(lower)) { usedNames.add(lower); return tag; }
    let suffix = 1;
    let candidate = `${original}_dup${suffix}`;
    while (usedNames.has(candidate.toLowerCase())) {
      suffix++;
      candidate = `${original}_dup${suffix}`;
    }
    usedNames.add(candidate.toLowerCase());
    return tag.replace(`name="${original}"`, `name="${candidate}"`);
  });
  zip.file("xl/workbook.xml", newXml);
  return zip.generateAsync({ type: "uint8array" });
}

async function parseExcelBuffer(buffer: Buffer): Promise<{
  rows: ParsedRow[];
  sheets: string[];
  targetSheet: string;
  headerRow: Record<string, unknown>;
  wasSanitized: boolean;
}> {
  const sanitized = await sanitizeWorkbookSheetNames(buffer);
  const wasSanitized = sanitized !== buffer;
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(sanitized as any);

  const sheets = workbook.worksheets.map((w) => w.name);
  let ws = workbook.getWorksheet("sheet1") ?? workbook.worksheets[0];
  const isDataSheet = (sheet: ExcelJS.Worksheet) => {
    const h = sheet.getRow(1);
    const a = String(h.getCell(1).value ?? "").toLowerCase();
    return a.includes("waybill") && sheet.rowCount > 1;
  };
  if (ws && !isDataSheet(ws)) {
    const better = workbook.worksheets.find(isDataSheet);
    if (better) ws = better;
  }
  if (!ws) throw new Error("No worksheet found");

  const rows: ParsedRow[] = [];
  let header: Record<string, unknown> = {};

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      header = {
        A: row.getCell(1).value,
        K: row.getCell(11).value,
        L: row.getCell(12).value,
        M: row.getCell(13).value,
        N: row.getCell(14).value,
        Q: row.getCell(17).value,
      };
      return;
    }

    const dispatcherId = cellToString(row.getCell(13));
    if (!dispatcherId) return;

    const waybillNumber = cellToString(row.getCell(1));
    if (!waybillNumber) return;

    rows.push({
      waybillNumber,
      branchName: cellToString(row.getCell(11)),
      deliveryDate: cellToDate(row.getCell(12)),
      dispatcherId,
      dispatcherName: cellToString(row.getCell(14)),
      billingWeight: cellToWeight(row.getCell(17)),
    });
  });

  return { rows, sheets, targetSheet: ws.name, headerRow: header, wasSanitized };
}

async function diagnose(filePath: string) {
  const fileName = filePath.split("/").pop();
  console.log(`\n========================================`);
  console.log(`FILE: ${fileName}`);
  console.log(`========================================`);

  const buffer = readFileSync(filePath);
  console.log(`Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  const t0 = Date.now();
  let parsed;
  try {
    parsed = await parseExcelBuffer(buffer);
  } catch (err) {
    console.log(`PARSE FAILED: ${(err as Error).message}`);
    return;
  }
  const t1 = Date.now();
  console.log(`Parse time: ${t1 - t0}ms`);

  console.log(`Name-clash sanitization applied: ${parsed.wasSanitized ? "YES" : "no"}`);
  console.log(`\nSheets in workbook (${parsed.sheets.length}):`);
  console.log(`  ${parsed.sheets.slice(0, 10).join(", ")}${parsed.sheets.length > 10 ? ", ..." : ""}`);
  console.log(`Target sheet: "${parsed.targetSheet}"`);
  console.log(`Has "sheet1"? ${parsed.sheets.includes("sheet1")}`);

  console.log(`\nHeader row 1:`);
  for (const [k, v] of Object.entries(parsed.headerRow)) {
    console.log(`  Col ${k}: ${JSON.stringify(v)}`);
  }

  console.log(`\nRows extracted: ${parsed.rows.length}`);

  if (parsed.rows.length === 0) {
    console.log("  → FAIL: 'No delivery rows found in the uploaded file'");
    return;
  }

  // Detect branch
  const branchCounts = new Map<string, number>();
  for (const row of parsed.rows) {
    if (row.branchName) {
      branchCounts.set(row.branchName, (branchCounts.get(row.branchName) ?? 0) + 1);
    }
  }
  const detectedBranch = [...branchCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`\nBranch detection (col K):`);
  if (!detectedBranch) {
    console.log("  → FAIL: 'Could not detect branch code' (column K is empty)");
  } else {
    console.log(`  Detected: "${detectedBranch[0]}" (${detectedBranch[1]} rows)`);
    console.log(`  Top 3:`, [...branchCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3));
  }

  // Detect month/year
  const dateCounts = new Map<string, number>();
  let nullDates = 0;
  for (const row of parsed.rows) {
    if (row.deliveryDate) {
      const key = `${row.deliveryDate.getMonth() + 1}-${row.deliveryDate.getFullYear()}`;
      dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1);
    } else {
      nullDates++;
    }
  }
  const topDate = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`\nMonth/year detection (col L):`);
  console.log(`  Null/invalid dates: ${nullDates} / ${parsed.rows.length}`);
  if (!topDate) {
    console.log("  → FAIL: 'Could not detect month/year' (column L is empty)");
  } else {
    const [month, year] = topDate[0].split("-").map(Number);
    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    console.log(`  Detected: ${monthNames[month]} ${year} (${topDate[1]} rows)`);
    console.log(`  Top 3:`, [...dateCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3));
  }

  // Dispatcher distribution
  const dispIds = new Set(parsed.rows.map((r) => r.dispatcherId));
  console.log(`\nDispatchers found: ${dispIds.size} unique`);
  console.log(`  Sample:`, [...dispIds].slice(0, 5));

  // Sample rows
  console.log(`\nSample rows (first 3):`);
  for (const r of parsed.rows.slice(0, 3)) {
    console.log(`  ${JSON.stringify({
      waybill: r.waybillNumber,
      branch: r.branchName,
      date: r.deliveryDate?.toISOString() ?? null,
      disp: r.dispatcherId,
      name: r.dispatcherName,
      wt: r.billingWeight,
    })}`);
  }

  // Weight sanity
  const zeroWt = parsed.rows.filter((r) => r.billingWeight === 0).length;
  console.log(`\nRows with zero weight: ${zeroWt} / ${parsed.rows.length}`);
}

async function main() {
  const dataDir = join(process.cwd(), "data");
  const files = readdirSync(dataDir).filter((f) => f.endsWith(".xlsx"));
  console.log(`Found ${files.length} xlsx file(s) in ${dataDir}`);

  for (const f of files) {
    await diagnose(join(dataDir, f));
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
