// Env: DATABASE_URL, SESSION_SECRET, BLOB_READ_WRITE_TOKEN, ANTHROPIC_API_KEY (see README).
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@valuation/engine", "@valuation/db", "@valuation/exports"],
  serverExternalPackages: ["@resvg/resvg-js", "pdfkit", "exceljs"],
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  outputFileTracingIncludes: { "/**": ["./fonts/**"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
