/**
 * Captures a reproducible JS bundle baseline from `.next/static/chunks/`.
 *
 * Usage: `npm run build && npx tsx scripts/capture-bundle-baseline.ts`
 *
 * Output: docs/perf/baseline/bundle-summary.md
 *   - total chunk bytes (raw + gzipped)
 *   - top N largest chunks
 *   - comparable across builds — rerun after a fix and diff the markdown
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const ROOT = path.resolve(__dirname, "..");
const CHUNKS_DIR = path.join(ROOT, ".next", "static", "chunks");
const OUT = path.join(ROOT, "docs", "perf", "baseline", "bundle-summary.md");
const TOP_N = 25;

function gzSize(buf: Buffer): number {
  return zlib.gzipSync(buf, { level: 9 }).length;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function kb(n: number): string {
  return (n / 1024).toFixed(1);
}

function main() {
  if (!fs.existsSync(CHUNKS_DIR)) {
    console.error(`Missing ${CHUNKS_DIR} — run \`npm run build\` first.`);
    process.exit(1);
  }

  const files = walk(CHUNKS_DIR).filter((f) => f.endsWith(".js") || f.endsWith(".css"));
  type Row = { name: string; raw: number; gz: number };
  const rows: Row[] = files.map((full) => {
    const buf = fs.readFileSync(full);
    return {
      name: path.relative(CHUNKS_DIR, full),
      raw: buf.length,
      gz: gzSize(buf),
    };
  });

  const jsRows = rows.filter((r) => r.name.endsWith(".js"));
  const cssRows = rows.filter((r) => r.name.endsWith(".css"));

  const totalRawJs = jsRows.reduce((sum, r) => sum + r.raw, 0);
  const totalGzJs = jsRows.reduce((sum, r) => sum + r.gz, 0);
  const totalRawCss = cssRows.reduce((sum, r) => sum + r.raw, 0);
  const totalGzCss = cssRows.reduce((sum, r) => sum + r.gz, 0);

  jsRows.sort((a, b) => b.gz - a.gz);

  const nowIso = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# Bundle Size Baseline`);
  lines.push("");
  lines.push(`Captured: ${nowIso}`);
  lines.push(`Source: \`.next/static/chunks/\` after \`npm run build\``);
  lines.push("");
  lines.push(`## Totals`);
  lines.push("");
  lines.push(`| Category | Files | Raw | Gzipped |`);
  lines.push(`|---|---:|---:|---:|`);
  lines.push(`| JS | ${jsRows.length} | ${kb(totalRawJs)} KB | ${kb(totalGzJs)} KB |`);
  lines.push(`| CSS | ${cssRows.length} | ${kb(totalRawCss)} KB | ${kb(totalGzCss)} KB |`);
  lines.push("");
  lines.push(`## Top ${TOP_N} JS chunks by gzipped size`);
  lines.push("");
  lines.push(`| # | Chunk | Raw (KB) | Gzipped (KB) |`);
  lines.push(`|---:|---|---:|---:|`);
  jsRows.slice(0, TOP_N).forEach((r, i) => {
    lines.push(`| ${i + 1} | \`${r.name}\` | ${kb(r.raw)} | ${kb(r.gz)} |`);
  });
  lines.push("");
  lines.push(`## Full chunk list`);
  lines.push("");
  lines.push(`<details><summary>Show all ${jsRows.length} JS chunks</summary>`);
  lines.push("");
  lines.push(`| Chunk | Raw (KB) | Gzipped (KB) |`);
  lines.push(`|---|---:|---:|`);
  jsRows.forEach((r) => {
    lines.push(`| \`${r.name}\` | ${kb(r.raw)} | ${kb(r.gz)} |`);
  });
  lines.push("");
  lines.push(`</details>`);
  lines.push("");

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n"));
  console.log(`Wrote ${OUT}`);
  console.log(`  JS: ${jsRows.length} files, ${kb(totalRawJs)} KB raw, ${kb(totalGzJs)} KB gzipped`);
  console.log(`  CSS: ${cssRows.length} files, ${kb(totalRawCss)} KB raw, ${kb(totalGzCss)} KB gzipped`);
}

main();
