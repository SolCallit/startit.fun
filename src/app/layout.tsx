import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Backdrop } from "@/components/backdrop";
import "./globals.css";

// Self-hosted Tinos is metric-compatible with Times New Roman: the whole app is set in Times, even on phones without it.
const tinos = localFont({
  src: [
    { path: "./fonts/tinos-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/tinos-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/tinos-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-tinos",
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
  title: { default: "Startit: memecoin money for real products", template: "%s · Startit" },
  description:
    "Back a real product, get the brand's sign-off and launch its coin. Every launch is screened, reviewed by a person and paid out in public.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${tinos.variable} antialiased`}>
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
