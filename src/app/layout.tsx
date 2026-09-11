import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

// Cobalt typography: Manrope everywhere, JetBrains Mono for numerics.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SnapCard",
  description: "Scan a business card, review it, and create the lead in Salesforce.",
  applicationName: "SnapCard",
  // Standalone on iOS, and the title used under the home-screen icon.
  appleWebApp: { capable: true, title: "SnapCard", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Phone numbers on a card are data, not links to dial.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f8fa",
  // viewport-fit=cover so env(safe-area-inset-*) is non-zero on notched phones.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables go on <html>, because globals.css applies font-sans
    // there — on <body> they would be defined below the element using them.
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
