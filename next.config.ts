import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * The MongoDB driver reaches for Node built-ins like `net`, and
   * instrumentation.ts is bundled for the Edge runtime as well as Node — so
   * importing it there made webpack try to resolve `net` for Edge and the
   * whole app 500'd. Left external, it is required at runtime by Node only.
   */
  serverExternalPackages: ["mongodb"],
  experimental: {
    // Both are single barrels re-exporting everything they contain — ~9000
    // icons, and every Radix primitive. Without this, a page that uses one
    // Button ships the whole of Radix.
    optimizePackageImports: ["@phosphor-icons/react", "radix-ui"],
  },
  async headers() {
    return [
      {
        // Belt and braces with the json() helper: no proxy, CDN or browser may
        // hold a lead's fields or a scan result.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        /*
         * The service worker and the manifest must be revalidated every time.
         * A cached sw.js is how an app gets stuck on an old build for a week,
         * and Hostinger sits behind a CDN.
         */
        source: "/:file(sw.js|manifest.webmanifest)",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // A service worker in front of the dev server fights HMR and caches the very
  // thing you are editing. It is exercised against `next build && next start`.
  disable: process.env.NODE_ENV === "development",
  /*
   * Nothing from public/ is precached. The icons are fetched by the OS from
   * the web manifest at install time, so precaching them buys nothing — and on
   * Windows the plugin writes them into the manifest with backslashes
   * ("/icons\icon-192.png"), which 404 at runtime. A precache entry that
   * fails to fetch aborts service worker installation outright, leaving the app
   * with no service worker at all and no error to show for it.
   */
  globPublicPatterns: [],
});

export default withSerwist(nextConfig);
