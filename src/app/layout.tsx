import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (OFL) so builds never depend on reaching Google Fonts.
const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});
const schibsted = localFont({
  src: "./fonts/schibsted-grotesk-latin-wght-normal.woff2",
  variable: "--font-schibsted",
  weight: "400 900",
  display: "swap",
});
const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#0b1b27", colorScheme: "dark" };

export const metadata: Metadata = {
  title: { default: "Startit — founder-approved token launches", template: "%s · Startit" },
  description:
    "Community tokens for real startups, launched only with founder approval, AI-assisted screening and human review. Every check is published.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${schibsted.variable} ${jetbrains.variable} antialiased`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
