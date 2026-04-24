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
  // Force-include pdfkit's Adobe Font Metrics files in the Lambda bundle
  // for every API route that might render a PDF. Without this, pdfkit hits
  // ENOENT on `node_modules/pdfkit/js/data/Helvetica.afm` at runtime on
  // Vercel because Next's file-trace (nft) can't statically resolve the
  // dynamic `fs.readFileSync(...afm)` call it makes and excludes the data
  // directory from deployment. The symptom was every PDF chunk failing
  // with "ENOENT: ... /pdfkit/js/data/Helvetica.afm" and the bulk export
  // wrapping it as "All chunks failed — nothing to archive".
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
