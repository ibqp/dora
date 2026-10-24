import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repository lives in an iCloud-synced folder. iCloud skips names ending in ".nosync";
  // with the default ".next" it creates conflict copies ("file 2.ts") that break the build.
  distDir: ".next.nosync",
  // The Docker build sets NEXT_OUTPUT=standalone (minimal server.js + traced node_modules).
  // Local `next start` keeps the regular output, with which it is meant to be used.
  output: process.env["NEXT_OUTPUT"] === "standalone" ? "standalone" : undefined,
  // The PDF route reads the embedded fonts from disk (not via import), so the trace cannot see them.
  outputFileTracingIncludes: {
    "/api/brds/*/pdf": ["./assets/fonts/**/*"],
  },
  cacheComponents: true,
  // PDFKit reads its font metrics and data files from its package directory at runtime.
  serverExternalPackages: ["pdfkit"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
