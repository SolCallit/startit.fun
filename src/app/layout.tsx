import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Backdrop } from "@/components/backdrop";
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070c14" },
    { media: "(prefers-color-scheme: light)", color: "#e8ecf1" },
  ],
};

/** Applies the saved theme before first paint (no flash). Dark unless the visitor chose light. */
const THEME_INIT = `try{var t=localStorage.getItem("startit-theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export const metadata: Metadata = {
  title: { default: "Startit: founder-approved token launches", template: "%s · Startit" },
  description:
    "Community tokens for real startups, launched only with founder approval, AI-assisted screening and human review. Every check is published.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${bricolage.variable} ${schibsted.variable} ${jetbrains.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh">
        <Backdrop />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
