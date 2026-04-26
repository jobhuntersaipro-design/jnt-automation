import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseExcelBuffer } from "../parser";

/**
 * Build a synthetic xlsx buffer with the J&T column layout.
 * @param sheetNames one worksheet is created per entry; rows are populated
 *                   only on sheets whose name matches `dataSheetName`.
 */
async function buildWorkbook(
  sheetNames: string[],
  dataSheetName: string,
  rows: Array<{
    waybill: string;
    branch: string;
    date: Date;
    dispId: string;
    dispName: string;
    weight: number | null;
  }>,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const name of sheetNames) {
    const ws = wb.addWorksheet(name);
    ws.getRow(1).values = [
      "Waybill Number", null, null, null, null, null, null, null, null, null,
      "DP | Signing", "Delivery Signature", "Dispatcher ID", "Dispatcher Name",
      null, null, "Billing Weight",
    ];
    if (name === dataSheetName) {
      rows.forEach((r, i) => {
        const row = ws.getRow(i + 2);
        row.getCell(1).value = r.waybill;
        row.getCell(11).value = r.branch;
        row.getCell(12).value = r.date;
        row.getCell(13).value = r.dispId;
        row.getCell(14).value = r.dispName;
        if (r.weight !== null) row.getCell(17).value = r.weight;
      });
    }
  }
  const buf = (await wb.xlsx.writeBuffer()) as Buffer;
  return new Uint8Array(buf);
}

/**
 * ExcelJS normalises names case-insensitively when writing, so we can't
 * simply `addWorksheet("Sheet1")` + `addWorksheet("sheet1")`. Instead, build
 * a clean workbook then mutate the xlsx zip to introduce the collision —
 * mirroring what the J&T exporter produces.
 */
async function buildWorkbookWithCaseCollision(
  rows: Array<{
    waybill: string;
    branch: string;
    date: Date;
    dispId: string;
    dispName: string;
    weight: number | null;
  }>,
): Promise<Uint8Array> {
  // Two sheets named differently so exceljs will save them happily
  const buf = await buildWorkbook(["Sheet1_cover", "sheet1"], "sheet1", rows);

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const wbFile = zip.file("xl/workbook.xml");
  if (!wbFile) throw new Error("no workbook.xml");
  const xml = await wbFile.async("string");
  // Rename the cover sheet's name attribute back to "Sheet1" to create a
  // case-insensitive collision with "sheet1" — the bug seen in real exports.
  const patched = xml.replace(/name="Sheet1_cover"/, 'name="Sheet1"');
  zip.file("xl/workbook.xml", patched);
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseExcelBuffer — happy path", () => {
  it("parses a simple single-sheet workbook", async () => {
    const buf = await buildWorkbook(
      ["sheet1"],
      "sheet1",
      [
        {
          waybill: "WB1",
          branch: "PHG379",
          date: new Date("2026-02-01T07:00:00Z"),
          dispId: "PHG379-01",
          dispName: "ALICE",
          weight: 1.5,
        },
        {
          waybill: "WB2",
          branch: "PHG379",
          date: new Date("2026-02-02T07:00:00Z"),
          dispId: "PHG379-02",
          dispName: "BOB",
          weight: 3.2,
        },
      ],
    );

    const rows = await parseExcelBuffer(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      waybillNumber: "WB1",
      branchName: "PHG379",
      dispatcherId: "PHG379-01",
      dispatcherName: "ALICE",
      billingWeight: 1.5,
    });
    expect(rows[0].deliveryDate).toBeInstanceOf(Date);
  });

  it("skips sub-parcel rows whose waybill contains a dash", async () => {
    const buf = await buildWorkbook(
      ["sheet1"],
      "sheet1",
      [
        {
          waybill: "680030939458201",
          branch: "PHG379",
          date: new Date("2026-02-01T07:00:00Z"),
          dispId: "PHG379-01",
          dispName: "ALICE",
          weight: 2.0,
        },
        {
          waybill: "680030939458201-02",
          branch: "PHG379",
          date: new Date("2026-02-01T07:00:00Z"),
          dispId: "PHG379-01",
          dispName: "ALICE",
          weight: 0,
        },
      ],
    );
    const rows = await parseExcelBuffer(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].waybillNumber).toBe("680030939458201");
  });

  it("skips rows whose billing-weight cell is empty", async () => {
    const buf = await buildWorkbook(
      ["sheet1"],
      "sheet1",
      [
        {
          waybill: "WBHEAVY",
          branch: "PHG379",
          date: new Date("2026-02-01T07:00:00Z"),
          dispId: "PHG379-01",
          dispName: "ALICE",
          weight: 4.5,
        },
        {
          waybill: "WBNOWEIGHT",
          branch: "PHG379",
          date: new Date("2026-02-01T07:00:00Z"),
          dispId: "PHG379-01",
          dispName: "ALICE",
          weight: null,
        },
      ],
    );
    const rows = await parseExcelBuffer(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].waybillNumber).toBe("WBHEAVY");
  });

  it("skips rows with no dispatcher ID or no waybill", async () => {
    const buf = await buildWorkbook(
      ["sheet1"],
      "sheet1",
      [
        {
          waybill: "WB1",
          branch: "PHG379",
          date: new Date("2026-02-01T07:00:00Z"),
          dispId: "PHG379-01",
          dispName: "ALICE",
          weight: 1.5,
        },
      ],
    );
    const rows = await parseExcelBuffer(buf);
    expect(rows).toHaveLength(1);
  });
});

describe("parseExcelBuffer — case-insensitive sheet-name collision", () => {
  it("recovers from workbooks that have both 'Sheet1' and 'sheet1'", async () => {
    const buf = await buildWorkbookWithCaseCollision([
      {
        waybill: "WB100",
        branch: "PHG379",
        date: new Date("2026-03-15T07:00:00Z"),
        dispId: "PHG379-99",
        dispName: "CHARLIE",
        weight: 2.1,
      },
      {
        waybill: "WB101",
        branch: "PHG379",
        date: new Date("2026-03-16T07:00:00Z"),
        dispId: "PHG379-99",
        dispName: "CHARLIE",
        weight: 4.4,
      },
    ]);

    const rows = await parseExcelBuffer(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0].waybillNumber).toBe("WB100");
    expect(rows[1].waybillNumber).toBe("WB101");
    expect(rows[0].dispatcherId).toBe("PHG379-99");
  });

  it("prefers the data-bearing sheet when 'sheet1' is an empty cover", async () => {
    // Build workbook with two data sheets — the lowercase "sheet1" will be the
    // empty cover sheet (no rows), the data lives in a differently-named sheet
    // picked up by the header-detection fallback.
    const buf = await buildWorkbook(
      ["sheet1", "dispatcher_data"],
      "dispatcher_data",
      [
        {
          waybill: "WB500",
          branch: "PHG379",
          date: new Date("2026-03-15T07:00:00Z"),
          dispId: "PHG379-42",
          dispName: "DIANA",
          weight: 1.0,
        },
      ],
    );

    const rows = await parseExcelBuffer(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].waybillNumber).toBe("WB500");
  });
});
