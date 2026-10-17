import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, EmptyState, Mono, PageHeader } from "@/components/ui";
import { FeeRecordLists, FeeTotals } from "@/components/fee-records";
import { getPublicFees } from "@/lib/data/public";

export const metadata: Metadata = { title: "Fees and payouts" };

export default function Fees() {
  return (
    <Container className="py-14">
      <PageHeader title="Where the fees go"
        lede="Every trading fee Startit collects and every payout from the Fee Router multisig, with the Solana transaction for each. Nothing here is estimated." />
      <Suspense fallback={<p className="text-muted">Loading fee records…</p>}><Body /></Suspense>
      <p className="mt-10 max-w-2xl text-[0.875rem] leading-relaxed text-muted">
        Amounts are in SOL. Raydium&apos;s own protocol fee is charged separately and isn&apos;t shown. Payouts marked
        “awaiting multisig” have been proposed in Squads and still need the multisig signers&apos; approval.
      </p>
    </Container>
  );
}

async function Body() {
  const r = await getPublicFees();
  if (!r.connected) return <EmptyState title="Fee records aren't connected yet">They appear here once the Startit database is live.</EmptyState>;
  return (
    <div className="flex flex-col gap-10">
      <FeeTotals claims={r.claims} payouts={r.payouts} />
      <FeeRecordLists claims={r.claims} payouts={r.payouts} showProject />
      {process.env.NEXT_PUBLIC_FEE_ROUTER ? <p className="text-ink-soft">Fee Router: <Mono>{process.env.NEXT_PUBLIC_FEE_ROUTER}</Mono></p> : null}
    </div>
  );
}
