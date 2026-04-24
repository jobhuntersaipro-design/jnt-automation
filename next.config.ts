import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
      { hostname: "**.r2.dev" },
      { hostname: "**.cloudflarestorage.com" },
    ],
  },
  // Keep pdfkit as an external require at runtime instead of letting webpack
  // bundle it into the route's compiled chunk. When pdfkit is bundled,
  // `__dirname` rewrites during compilation can break its runtime font-lookup
  // (`fs.readFileSync(__dirname + '/data/Helvetica.afm')` in pdfkit.js:2428).
  // As an external, `__dirname` stays `node_modules/pdfkit/js/` — which is
  // exactly the path the deployed Lambda's error references.
  serverExternalPackages: ["pdfkit"],

  // Force-include pdfkit's Adobe Font Metrics files in the Lambda bundle for
  // every route that renders a PDF. Without this, pdfkit hits ENOENT on
  // `node_modules/pdfkit/js/data/Helvetica.afm` at runtime on Vercel because
  // nft can't statically resolve the 14 per-font `fs.readFileSync(__dirname
  // + '/data/<Name>.afm')` calls in pdfkit.js (lines 2416–2473) and excludes
  // the `data/` directory from deployment.
  //
  // Explicit per-route keys: the glob `/api/**/*` traced the files into the
  // local `.nft.json` but Vercel's build pipeline did not end up copying
  // them into the deployed Lambda. Pinning each PDF-rendering route by its
  // exact file path is the pattern that reliably works in 2026. Context:
  // https://github.com/foliojs/pdfkit/issues/1549
  outputFileTracingIncludes: {
    // Bulk month-detail PDF fan-out worker — the route hitting this bug
    "/api/dispatchers/month-detail/bulk/worker/chunk": [
      "./node_modules/pdfkit/js/data/**",
    ],
    // Per-record PDF download (cache-miss inline generation)
    "/api/staff/[id]/history/[salaryRecordId]/export/pdf": [
      "./node_modules/pdfkit/js/data/**",
    ],
    // Cache prewarm (legacy inline path + fan-out chunk worker + finalize)
    "/api/payroll-cache/prewarm": ["./node_modules/pdfkit/js/data/**"],
    "/api/payroll-cache/prewarm/worker/chunk": [
      "./node_modules/pdfkit/js/data/**",
    ],
    "/api/payroll-cache/prewarm/worker/finalize": [
      "./node_modules/pdfkit/js/data/**",
    ],
    // Dev-only inline fallback path lives on /bulk/start when QStash envs
    // aren't set; keep it covered in case prod ever takes that branch
    "/api/dispatchers/month-detail/bulk/start": [
      "./node_modules/pdfkit/js/data/**",
    ],
    // Belt-and-suspenders glob in case a new PDF route gets added
    "/api/**/*": ["./node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
