import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // @kiezruf/shared ships TypeScript source (main: src/index.ts).
  transpilePackages: ["@kiezruf/shared"],
};

export default nextConfig;
