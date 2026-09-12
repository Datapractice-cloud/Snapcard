import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. Installing the app is not a nicety here:
 * a rep on a home-screen icon keeps their session, gets the camera without
 * browser chrome, and does not lose the outbox to a closed tab.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SnapCard",
    short_name: "SnapCard",
    description: "Scan a business card, check it, and save the lead to Salesforce.",
    // Straight to the camera. Nobody installs this to read a dashboard.
    start_url: "/scan",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: "#f7f8fa",
    icons: [
      /*
       * The vector first, so a launcher that understands SVG renders the mark
       * at whatever density the device has. The PNGs stay because Android and
       * iOS both still fall back to them.
       */
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Lets Android crop to its own shape without clipping the mark.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
