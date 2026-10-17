import type { Metadata } from "next";
import { Container, Notice, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Terms and risks" };

export default function Terms() {
  return (
    <Container className="py-14">
      <PageHeader title="Terms and risk disclosures" lede="Read this before buying any token launched through Startit." />
      <div className="mb-8 max-w-[68ch]">
        <Notice tone="warn">
          Draft for legal review. These disclosures describe how the platform works; they have not yet been reviewed by
          counsel and are not final terms of service.
        </Notice>
      </div>
      <article className="prose-ledger">
        <h2>Tokens are speculative</h2>
        <p>
          Meme tokens can lose all of their value quickly. Prices can move on sentiment alone, liquidity can disappear, and
          you may not be able to sell. Only use money you can afford to lose entirely.
        </p>
        <h2>A token is not equity</h2>
        <p>
          Holding a token does not give you shares, profit rights, voting rights in the company or any claim on its
          revenue. The founder&apos;s approval means they consented to the launch and its branding. It does not make the
          company responsible for the token&apos;s price.
        </p>
        <h2>Fees and custody</h2>
        <p>
          Trading fees captured by Startit on Raydium LaunchLab are collected into a Startit-controlled multisig and then
          paid out by the disclosed split. By default that&apos;s 50% to the community treasury, 30% to the founder, 5% to the person
          who launched the project and 15% to Startit (20% when the founder launched it themselves). Between collection and
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
