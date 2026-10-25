import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared TS package from the monorepo (packages/protocol)
  transpilePackages: ["@snapduo/protocol"],
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
