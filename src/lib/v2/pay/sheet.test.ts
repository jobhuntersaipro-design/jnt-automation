import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readCsvText, readXlsx } from "./sheet";

describe("readXlsx", () => {
  it("reads every sheet as text: merged titles, formulas, full precision, blank rows kept", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Rates");
    ws.getCell("A1").value = "Rate card";
    ws.mergeCells("A1:C1");
    ws.getRow(3).values = ["Weight", "Bike", "Car"];
    ws.getRow(4).values = ["0-5", 1.2345, { formula: "B4*2", result: 2.469 }];
    ws.getCell("B4").numFmt = "0.00"; // shown as 1.23, read as 1.2345
    wb.addWorksheet("Notes").getCell("A1").value = { richText: [{ text: "See " }, { text: "terms" }] };

    const sheets = await readXlsx(await wb.xlsx.writeBuffer());
    expect(sheets.map((s) => s.name)).toEqual(["Rates", "Notes"]);
    expect(sheets[0].rows).toEqual([["Rate card", "Rate card", "Rate card"], [], ["Weight", "Bike", "Car"], ["0-5", "1.2345", "2.469"]]);
    expect(sheets[1].rows).toEqual([["See terms"]]);
  });
});

describe("readCsvText", () => {
  it("reads UTF-8, and GB18030 from Excel on Chinese Windows", () => {
    expect(readCsvText(new TextEncoder().encode("重量,费率").buffer)).toBe("重量,费率");
    expect(readCsvText(new Uint8Array([0xd6, 0xd8, 0xc1, 0xbf, 0x2c, 0x31]).buffer)).toBe("重量,1");
  });
});
