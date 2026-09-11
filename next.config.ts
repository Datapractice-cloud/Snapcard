import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Both are single barrels re-exporting everything they contain — ~9000
    // icons, and every Radix primitive. Without this, a page that uses one
    // Button ships the whole of Radix.
    optimizePackageImports: ["@phosphor-icons/react", "radix-ui"],
  },
};

export default nextConfig;
