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
    <html lang="en">
      <body className={`${manrope.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
