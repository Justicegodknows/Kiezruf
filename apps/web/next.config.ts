import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The workspace package ships TypeScript source (packages/shared, ENG-11). Next transpiles workspace packages on
  // its own; listing it keeps that true however the app is built (e.g. on Vercel with apps/web as the root).
  transpilePackages: ["@kiezruf/shared"],
};

export default nextConfig;
