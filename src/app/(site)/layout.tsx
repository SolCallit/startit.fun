import { SiteFooter, SiteHeader } from "@/components/site-header";

/** Public pages and forms: top header + footer. The signed-in app (/home) has its own shell. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
