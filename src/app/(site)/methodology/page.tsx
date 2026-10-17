import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "How we verify" };

export default function Methodology() {
  return (
    <Container className="py-14">
      <PageHeader
        title="How we verify a project"
        lede="What the AI screen and the human review check, what they can't check, and how decisions are recorded."
      />
      <article className="prose-ledger">
        <h2>What the AI screening agent does</h2>
        <p>
          When an application is submitted, our screening agent reads the public sources the founder listed and compares
          them with the application. It works only from server-side integrations we control, and treats every page,
          repository file and document it reads as untrusted content — instructions inside those sources are ignored.
        </p>
        <ul>
          <li><strong>Links.</strong> Every URL must be HTTPS and resolve to a public address. Private, internal and cloud-metadata addresses are refused.</li>
          <li><strong>Repository.</strong> Ownership, age, commit activity, releases, contributors and README, through the GitHub API.</li>
          <li><strong>Website and docs.</strong> Whether the product described exists where the founder says it does, and whether it links back to the same accounts.</li>
          <li><strong>Accounts.</strong> Whether the X account, website and repository consistently point to one another, and signs of look-alike or impersonating accounts.</li>
          <li><strong>Token disclosures.</strong> Whether the proposed supply, allocations and control arrangements are complete and consistent.</li>
        </ul>
        <p>
          The output is a report of individual findings, each labelled Verified, Unverified, Needs review or Flagged, with
          the source URL and the time it was fetched. Every report also lists its limitations: the things it could not
          check. The agent then recommends one of three next steps — send to human review, ask for more evidence, or
          reject — and nothing else. It cannot approve an application, deploy a token, sign a transaction or move funds.
        </p>

        <h2>What the human reviewer does</h2>
        <p>
          A Startit operator reads the application, the evidence and the AI findings, and verifies the founder&apos;s identity
          and authority to approve a token for the company. Only an operator can approve, reject, request evidence or
          suspend, and each decision is stored with the operator, the time and the reason. That history can&apos;t be edited
          or deleted.
        </p>

        <h2>Before launch</h2>
        <ol>
          <li>The token&apos;s supply, mint and freeze authorities, liquidity arrangements, insider allocations and treasury controls are written down and disclosed.</li>
          <li>The founder signs the fee and launch agreement.</li>
          <li>The operator reviews a preview of the exact transaction and confirms it.</li>
          <li>After launch, the deployed addresses are checked on-chain and published on the project page.</li>
        </ol>
        <p>An approval never triggers a launch on its own.</p>

        <h2>What we can&apos;t tell you</h2>
        <p>
          Verification describes evidence at a point in time. It can&apos;t tell you whether a team will keep building,
          whether a product will succeed, or whether a token will hold value. A public repository, a working website or a
          founder&apos;s post is evidence, not proof of trustworthiness. We never describe a project as safe, guaranteed or
          rug-proof, and you shouldn&apos;t read our approval that way.
        </p>
      </article>
    </Container>
  );
}
