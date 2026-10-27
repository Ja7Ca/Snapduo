import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // Shared TS package from the monorepo (packages/protocol)
  transpilePackages: ["@snapduo/protocol"],
  // Ties error reports to a deploy (Vercel sets the commit SHA at build).
  env: {
    NEXT_PUBLIC_RELEASE: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  },
  async headers() {
    const signal = process.env.NEXT_PUBLIC_SIGNAL_URL || "http://localhost:8787";
    return [{ source: "/:path*", headers: securityHeaders(signal, process.env.NODE_ENV === "production") }];
  },
  cacheComponents: true,
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
