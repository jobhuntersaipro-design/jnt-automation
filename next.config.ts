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
};

export default nextConfig;
