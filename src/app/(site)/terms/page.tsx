import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { TermsBody } from "@/components/legal/terms-body";
import { TERMS_UPDATED } from "@/lib/legal/terms-of-use";

export const metadata: Metadata = { title: "Terms and risks" };

export default function Terms() {
  return (
    <Container className="py-14">
      <PageHeader title="Terms and risks" lede="The terms every wallet accepts, and the risks to read before buying any token launched through Startit." />
      <section className="glass mb-12 max-w-[72ch] rounded-[20px] p-5 sm:p-7">
        <h2 className="text-[1.5rem] text-ink">Website Terms of Use</h2>
        <p className="mt-1 text-[0.875rem] text-muted">Last updated: {TERMS_UPDATED}</p>
        <TermsBody className="mt-5" />
      </section>
      <h2 className="mb-2 text-[1.5rem] text-ink">Risk disclosures</h2>
      <article className="prose-ledger">
        <h2>Tokens are speculative</h2>
        <p>
          Meme tokens can lose all of their value quickly. Prices can move on sentiment alone, liquidity can disappear, and
          you may not be able to sell. Only use money you can afford to lose entirely.
        </p>
        <h2>A token is not equity</h2>
        <p>
          Holding a token does not give you shares, profit rights, voting rights in the project or any claim on its
          revenue. The builder&apos;s approval means they consented to the launch and its branding. It does not make the
          team responsible for the token&apos;s price.
        </p>
        <h2>Fees and custody</h2>
        <p>
          Trading fees captured by Startit on Raydium LaunchLab are collected into a Startit-controlled multisig and then
          paid out by the disclosed split. By default that&apos;s 50% to the community treasury, 30% to the builder, 5% to the person
          who launched the project and 15% to Startit (20% when the builder launched it themselves). Between collection and
          payout, Startit holds those funds. Every collection and
          payout is published with its transaction signature. Raydium charges its own protocol fee, which is separate.
        </p>
        <h2>Smart contracts</h2>
        <p>
          Launches use Raydium&apos;s LaunchLab and CPMM programs. Startit did not write or audit those programs and does not
          represent them as risk-free. Software can have bugs that lead to loss of funds.
        </p>
        <h2>Milestones</h2>
        <p>Product milestones shown on project pages are informational. They are not promises of token performance.</p>
      </article>
    </Container>
  );
}
