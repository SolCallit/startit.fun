import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, EmptyState, Mono, Notice, Panel } from "@/components/ui";
import { loadSigningRequest } from "@/lib/launch/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { WalletSign } from "./wallet-sign";

export const metadata: Metadata = { title: "Sign launch terms", robots: { index: false, follow: false } };

export default function SignPage({ params }: PageProps<"/sign/[token]">) {
  return (
    <Container className="py-12">
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Body params={params} /></Suspense>
    </Container>
  );
}

async function Body({ params }: { params: PageProps<"/sign/[token]">["params"] }) {
  const { token } = await params;
  if (!isSupabaseConfigured()) return <EmptyState title="Signing isn't available yet">The Startit database isn&apos;t connected.</EmptyState>;
  const res = await loadSigningRequest(token);
  if (!res.ok) return <EmptyState title="This link can't be used">{res.reason}</EmptyState>;
  const r = res.req;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[2rem] leading-tight font-bold tracking-[-0.02em] text-ink">Sign the launch terms for {r.projectName} <span className="text-muted">${r.ticker}</span></h1>
      <p className="mt-3 text-[1.0625rem] text-ink-soft">
        You&apos;re signing as the <strong className="text-ink">{r.role}</strong>. Read the terms below, then sign with the wallet ending{" "}
        <Mono className="text-ink">{r.expectedWallet.slice(-6)}</Mono>. That wallet receives your share of fees.
      </p>
      <div className="mt-6"><Notice tone="warn">Startit will never ask for your seed phrase or for a transaction on this page. Only sign the message — never anything that moves funds.</Notice></div>

      <div className="mt-8">
        <Panel title="Launch terms" aside={<Mono className="text-[0.8125rem] text-muted">sha256 {r.termsSha256.slice(0, 16)}…</Mono>}>
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md bg-paper p-4 font-mono text-[0.8125rem] leading-relaxed text-ink">{r.termsText}</pre>
        </Panel>
      </div>

      <section className="mt-8 rounded-[18px] glass p-5">
        <h2 className="mb-4 text-[1.125rem] font-semibold text-ink">Sign with your wallet</h2>
        <WalletSign token={token} role={r.role} publicRef={r.publicRef} termsSha256={r.termsSha256} expectedWallet={r.expectedWallet} />
      </section>
      <p className="mt-6 text-[0.8125rem] text-muted">This link works once and expires {new Date(r.expiresAt).toUTCString()}.</p>
    </div>
  );
}
