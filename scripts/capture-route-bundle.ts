/**
 * Per-route initial-load JS measurement.
 *
 * Parses each route's `page_client-reference-manifest.js` to collect the union
 * of chunk paths that the server tells the browser to load on initial render.
 * Sums their gzipped size from `.next/static/chunks/`.
 *
 * This is the number Phase 1 of web-performance-optimization targets: the
 * total JS a user actually pays for when opening a route cold.
 *
 * Usage: `npm run build && npx tsx scripts/capture-route-bundle.ts`
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const ROOT = path.resolve(__dirname, "..");
const SERVER_APP = path.join(ROOT, ".next", "server", "app");
const CHUNKS_DIR = path.join(ROOT, ".next", "static", "chunks");
const OUT = path.join(ROOT, "docs", "perf", "baseline", "route-bundles.md");

const ROUTES = [
  "/auth/login",
  "/auth/register",
  "/(dashboard)/dashboard",
  "/(dashboard)/dispatchers",
  "/(dashboard)/staff",
  "/(dashboard)/payroll",
  "/(dashboard)/settings",
  "/(dashboard)/admin",
];

function readManifestChunks(routeDir: string): Set<string> {
  const manifestPath = path.join(routeDir, "page_client-reference-manifest.js");
  if (!fs.existsSync(manifestPath)) return new Set();
  const src = fs.readFileSync(manifestPath, "utf8");
  const chunks = new Set<string>();
  // Match "/_next/static/chunks/XXX.js" strings
  const rx = /"\/_next\/static\/chunks\/([^"]+\.js)"/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src)) !== null) {
    chunks.add(m[1]);
  }
  return chunks;
}

const sizeCache = new Map<string, { raw: number; gz: number }>();
function sizeOf(chunk: string): { raw: number; gz: number } {
  const cached = sizeCache.get(chunk);
  if (cached) return cached;
  const p = path.join(CHUNKS_DIR, chunk);
  if (!fs.existsSync(p)) {
    const z = { raw: 0, gz: 0 };
    sizeCache.set(chunk, z);
    return z;
  }
  const buf = fs.readFileSync(p);
  const res = { raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length };
  sizeCache.set(chunk, res);
  return res;
}

function kb(n: number): string {
  return (n / 1024).toFixed(1);
}

function main() {
  const lines: string[] = [];
  lines.push(`# Per-Route Initial JS Bundle`);
  lines.push("");
  lines.push(`Captured: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Sum of client chunks referenced by each route's`);
  lines.push(`\`page_client-reference-manifest.js\`. This is the JS the browser`);
  lines.push(`pays for on a cold page load (before any dynamic imports fire).`);
  lines.push("");
  lines.push(`| Route | Chunks | Raw (KB) | Gzipped (KB) |`);
  lines.push(`|---|---:|---:|---:|`);

  for (const route of ROUTES) {
    const dir = path.join(SERVER_APP, route, "page") // in case of nested page dir
      .replace(/\/page$/, ""); // fallback
    const candidates = [
      path.join(SERVER_APP, route),
    ];
    const found = candidates.find((c) => fs.existsSync(c));
    if (!found) {
      lines.push(`| \`${route}\` | — | missing | — |`);
      continue;
    }
    const chunks = readManifestChunks(found);
    let raw = 0;
    let gz = 0;
    for (const c of chunks) {
      const s = sizeOf(c);
      raw += s.raw;
      gz += s.gz;
    }
    lines.push(`| \`${route}\` | ${chunks.size} | ${kb(raw)} | ${kb(gz)} |`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(`Wrote ${OUT}`);
  // Echo the table to stdout for quick comparison
  console.log("\n" + lines.slice(5).join("\n"));
}

main();
