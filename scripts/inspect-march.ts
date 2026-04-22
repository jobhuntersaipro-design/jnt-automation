/**
 * Unzip the March file and read workbook.xml to see what sheet names exist.
 * xlsx files are just zip archives containing XML.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";

async function main() {
  const path = join(process.cwd(), "data", "March - PHG379.xlsx");
  const buf = readFileSync(path);
  const zip = await JSZip.loadAsync(buf);

  console.log("Files inside xlsx zip:");
  const fileNames = Object.keys(zip.files).sort();
  for (const f of fileNames) {
    if (!zip.files[f].dir) {
      console.log(`  ${f}`);
    }
  }

  // Read workbook.xml to see declared sheets
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  if (wbXml) {
    console.log("\nxl/workbook.xml <sheet> elements:");
    const matches = wbXml.match(/<sheet\s[^>]*\/>/g) ?? [];
    for (const m of matches) {
      console.log(`  ${m}`);
    }
  }

  // Count worksheet files
  const wsFiles = fileNames.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  console.log(`\nWorksheet files on disk: ${wsFiles.length}`);

  // Sizes
  console.log("\nWorksheet file sizes:");
  for (const wf of wsFiles) {
    const bytes = await zip.file(wf)?.async("uint8array");
    console.log(`  ${wf}: ${bytes ? (bytes.length / 1024 / 1024).toFixed(2) : "?"} MB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
