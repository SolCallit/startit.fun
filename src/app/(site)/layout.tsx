import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { TermsGate } from "@/components/legal/terms-gate";
import { TermsBody } from "@/components/legal/terms-body";
import { getCurrentUser } from "@/lib/auth";
import { hasAcceptedTerms } from "@/lib/legal/data";
import { TERMS_UPDATED } from "@/lib/legal/terms-of-use";

/** Public pages and forms: top header + footer. Signed-in wallets must accept the Terms of Use first. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
      <Suspense fallback={null}>
        <TermsCheck />
      </Suspense>
    </div>
  );
}

async function TermsCheck() {
  const user = await getCurrentUser();
  if (!user || (await hasAcceptedTerms(user.id))) return null;
  return <TermsGate updated={TERMS_UPDATED}><TermsBody /></TermsGate>;
}
