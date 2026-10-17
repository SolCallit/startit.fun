/**
 * Startit Website Terms of Use. Shown in full to every new wallet before it can use the app, and on /terms.
 * Bump TERMS_VERSION whenever the text changes materially: everyone is asked to accept again.
 *
 * DRAFT FOR COUNSEL: the operating entity, governing law and arbitration seat must be confirmed by a lawyer
 * before mainnet. Until then the text refers to "the company that operates Startit".
 */
export const TERMS_VERSION = "2026-10-17";
export const TERMS_UPDATED = "October 17, 2026";

export type TermsSection = { title: string; body: string[] };

export const TERMS_PREAMBLE = [
  "THESE TERMS INCLUDE A WAIVER OF ANY RIGHT TO PARTICIPATE IN A CLASS ACTION AND A MANDATORY ARBITRATION CLAUSE THAT GOVERNS HOW DISPUTES ARE RESOLVED AND WAIVES YOUR RIGHT TO SUE IN COURT OR HAVE A TRIAL BY JURY. PLEASE READ SECTION 17 CAREFULLY.",
  "STARTIT IS SOFTWARE THAT HELPS PEOPLE APPLY FOR, REVIEW AND LAUNCH COMMUNITY TOKENS ON THIRD-PARTY PROTOCOLS. STARTIT IS NOT REGISTERED, LICENSED OR SUPERVISED BY ANY FINANCIAL REGULATOR. NOTHING ON THE WEBSITE IS AN OFFER TO SELL, OR A SOLICITATION OF AN OFFER TO BUY, ANY SECURITY, DERIVATIVE OR OTHER FINANCIAL PRODUCT, OR INVESTMENT, LEGAL, TAX OR OTHER PROFESSIONAL ADVICE. PLEASE READ SECTION 3 CAREFULLY.",
];

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: "1. Introduction",
    body: [
      "These Website Terms of Use (the \"Terms\") are a contract between you and the company that operates Startit (together with its affiliates, successors and assigns, \"Startit\", \"we\", \"our\" or \"us\"). They govern your access to and use of startit.fun and its related pages, applications, APIs and features (the \"Services\").",
      "By connecting a wallet, signing in, or otherwise using any part of the Services, you agree to these Terms and to any policies they refer to. If you do not agree, do not use the Services. If you use the Services on behalf of a team, project or company, you confirm you are authorized to bind it, and \"you\" includes it.",
    ],
  },
  {
    title: "2. Changes to these Terms and the Services",
    body: [
      "We may change these Terms at any time. We will post the updated Terms with a new \"Last updated\" date and, for material changes, ask you to accept them again the next time you use the Services. If you keep using the Services after a change takes effect, you accept the change.",
      "We may add, change, suspend or discontinue any part of the Services, including supported networks, pairs, fee levels and features, at any time and without liability to you. Fee and split changes apply only to launches whose terms are signed after the change.",
    ],
  },
  {
    title: "3. No advice, no offer, no fiduciary duty",
    body: [
      "Tokens launched through Startit are community memecoins. They are not shares, debt, profit-sharing rights or claims on any company, product or revenue, and holding one gives you no rights against Startit, a builder, a launcher or anyone else.",
      "Information on the Services, including verification reports, milestones, project pages, fee records and anything produced by our AI screening tools, is provided for general information only. It is not investment, financial, legal or tax advice, and it is not a recommendation to buy, sell or hold anything. You alone decide whether to transact, and you should consult your own advisers.",
      "Startit owes you no fiduciary duty. To the fullest extent permitted by law, you waive any fiduciary or similar duty you might otherwise claim against us.",
    ],
  },
  {
    title: "4. Eligibility",
    body: [
      "You must be at least 18 years old and able to form a binding contract. You may not use the Services if you are, or act for, a person who is the subject of sanctions, or if you are located in, organized in or ordinarily resident in a country or region subject to comprehensive sanctions, or anywhere your use would be unlawful.",
      "You are responsible for complying with the laws that apply to you. We may restrict access from any location, require information to confirm eligibility, and refuse or end access for anyone at our discretion.",
    ],
  },
  {
    title: "5. Your wallet and transactions",
    body: [
      "The Services are non-custodial. We never hold your private keys or seed phrase and cannot access, recover, reverse or cancel anything you sign. You are solely responsible for your wallet, its security and every transaction it signs.",
      "Blockchain transactions are final. Network fees, slippage, failed transactions, front-running and congestion are outside our control, and we are not responsible for losses from them. A transaction preview is a description of what you are about to sign, not a guarantee of its outcome.",
    ],
  },
  {
    title: "6. Third-party protocols and services",
    body: [
      "Launches run on third-party protocols and infrastructure we do not own or control, including Solana, Raydium LaunchLab and CPMM pools, wallet software, RPC providers, token-metadata sources, data providers and AI model providers. Their availability, behaviour, fees, upgrades, bugs and exploits are their responsibility, not ours.",
      "Pairs and quote tokens, including tokenized stocks, pre-IPO tokens, currencies and other tokens, are issued and governed by third parties. Their availability on Startit is not an endorsement, and their value, redeemability, legal status and supply are not our responsibility. A pair can be withdrawn at any time.",
    ],
  },
  {
    title: "7. Launchers and builders",
    body: [
      "If you submit an application, you represent and warrant that everything you provide is true, complete and not misleading; that the builder of the product has approved the launch, its name, ticker and branding; that you have the rights to every name, image, logo and other material you submit; and that the launch does not infringe anyone's rights or break any law.",
      "Submitting an application does not oblige us to review, approve or launch anything. We may approve, reject, request more information, suspend, delay, delist or decline to support any application, project or token at any time, for any reason or no reason, without liability. Our decisions are final.",
      "If an application is found to be false, misleading, unauthorized or infringing, we may suspend the project, publish a notice, withhold and forfeit any launcher or builder rewards that have not been paid, and recover rewards already paid.",
      "You grant Startit a worldwide, non-exclusive, royalty-free, perpetual and irrevocable licence to host, store, reproduce, display, adapt and publish everything you submit, including names, images, logos, links, signed terms and verification results, to operate, promote and keep a public record of the Services and any token launched through them.",
    ],
  },
  {
    title: "8. Fees, rewards and payouts",
    body: [
      "Startit charges the fees shown in the Services and in each launch's signed terms, including a share of trading fees actually collected. Fees are earned when collected and are non-refundable. Network fees, Raydium protocol fees and third-party charges are separate and are not refunded by us.",
      "Builder, launcher and community shares are paid from fees actually collected, not from trading volume, in the token the launch trades against, to the wallets in the signed terms. Payouts are made when they are reconciled and practical; we do not promise any amount or schedule.",
      "We may delay, withhold, offset or cancel any payout if collections and payouts do not reconcile, if a wallet is unreachable or sanctioned, if we suspect fraud, misrepresentation or a breach of these Terms, if a protocol or token malfunctions, or if the law requires it. Amounts that cannot be delivered after reasonable effort for 12 months may be treated as forfeited. You are responsible for any taxes on amounts you receive.",
      "A starter's buy, if disclosed, is made by the applicant from their own wallet at their own risk. It is not guaranteed to be the first buy or to get any particular price.",
    ],
  },
  {
    title: "9. Verification is not endorsement",
    body: [
      "Our screening and review check specific things at a specific time and say what they could not check. A verified finding means a source supported a claim when we looked, nothing more. Approval is not an endorsement, audit, guarantee of legitimacy or safety, or prediction of price.",
      "Our AI tools can be wrong, incomplete or out of date. Human reviewers can be wrong. Projects can change after review. You rely on any report or label at your own risk.",
    ],
  },
  {
    title: "10. Prohibited conduct",
    body: [
      "You will not: impersonate any person, team or brand; submit forged or unauthorized evidence; manipulate markets, wash trade, coordinate pump-and-dump schemes or spread false information about a project; use the Services to launder money, finance terrorism or evade sanctions; attack, overload, scrape or reverse engineer the Services; bypass access controls or rate limits; interfere with other users; or use the Services in any way that is unlawful or that we reasonably consider harmful.",
      "We may investigate, suspend or end access, remove content, delist projects and cooperate with authorities if we believe you have broken this section.",
    ],
  },
  {
    title: "11. Intellectual property",
    body: [
      "The Services, the Startit name, the START logo and all related software, designs and content are owned by Startit or its licensors. We give you a limited, revocable, non-transferable licence to use the Services for their intended purpose under these Terms. All other rights are reserved.",
      "If you send us feedback or ideas, we may use them freely without obligation to you.",
    ],
  },
  {
    title: "12. Assumption of risk",
    body: [
      "You understand and accept that: memecoins are highly speculative and can lose all value; prices can move on sentiment alone; liquidity can disappear; smart contracts, protocols, oracles and bridges can fail or be exploited; tokenized assets can depeg or be frozen by their issuers; regulations can change and make tokens or the Services unavailable; and you may lose everything you spend. You use the Services entirely at your own risk.",
    ],
  },
  {
    title: "13. Disclaimers",
    body: [
      "THE SERVICES ARE PROVIDED \"AS IS\" AND \"AS AVAILABLE\", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY OR UNINTERRUPTED OR ERROR-FREE OPERATION, TO THE FULLEST EXTENT PERMITTED BY LAW.",
    ],
  },
  {
    title: "14. Limitation of liability",
    body: [
      "TO THE FULLEST EXTENT PERMITTED BY LAW, STARTIT AND ITS OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, TOKENS, DIGITAL ASSETS, DATA, GOODWILL OR OPPORTUNITY, ARISING FROM OR RELATING TO THE SERVICES OR THESE TERMS, EVEN IF ADVISED OF THE POSSIBILITY.",
      "OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICES OR THESE TERMS IS LIMITED TO THE GREATER OF (A) THE PLATFORM FEES YOU PAID DIRECTLY TO STARTIT IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM AND (B) USD 100.",
      "Some jurisdictions do not allow certain exclusions or limits. In those places our liability is limited to the smallest extent the law allows.",
    ],
  },
  {
    title: "15. Indemnity",
    body: [
      "You will defend, indemnify and hold harmless Startit and its officers, directors, employees, contractors and agents from any claim, loss, liability, damage, cost or expense (including reasonable legal fees) arising from your use of the Services, your application or submitted materials, your token or project, your breach of these Terms, or your violation of any law or anyone's rights.",
    ],
  },
  {
    title: "16. Suspension and termination",
    body: [
      "We may suspend or end your access to all or part of the Services at any time, with or without notice. You may stop using the Services at any time. Sections that by their nature should survive (including 3, 7 to 9, and 11 to 19) survive termination. Public records of launches, signed terms and payouts remain published after termination.",
    ],
  },
  {
    title: "17. Disputes, arbitration and class-action waiver",
    body: [
      "Before starting any formal proceeding, you agree to contact us and try to resolve the dispute informally for at least 30 days.",
      "Any dispute, claim or controversy arising from or relating to the Services or these Terms that is not resolved informally will be resolved by final and binding individual arbitration, seated in the jurisdiction where Startit's operating company is organized, under the rules of a recognized arbitral institution chosen by Startit, conducted in English. Judgment on the award may be entered in any court with jurisdiction. Either party may bring an individual claim in small-claims court if it qualifies, or seek injunctive relief for misuse of intellectual property.",
      "YOU AND STARTIT EACH WAIVE THE RIGHT TO A JURY TRIAL AND TO PARTICIPATE IN A CLASS, COLLECTIVE OR REPRESENTATIVE ACTION. CLAIMS MAY ONLY BE BROUGHT ON AN INDIVIDUAL BASIS.",
      "You may opt out of this section by sending written notice to Startit through the contact channel listed on the website within 30 days of first accepting these Terms. Any claim must be brought within one year after it arose, or it is permanently barred, to the extent the law allows.",
    ],
  },
  {
    title: "18. Governing law",
    body: [
      "These Terms are governed by the laws of the jurisdiction in which Startit's operating company is organized, without regard to conflict-of-laws rules. Startit's legal name and registered address are available on request to anyone with a legitimate need, including to bring or defend a legal proceeding.",
    ],
  },
  {
    title: "19. General",
    body: [
      "These Terms, together with any launch terms you sign and the policies they refer to, are the entire agreement between you and Startit about the Services. If a launch's signed terms conflict with these Terms on that launch's fees, wallets or token configuration, the signed terms control for that launch.",
      "If any provision is found unenforceable, it will be enforced to the maximum extent possible and the rest will remain in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them freely. We are not liable for delays or failures caused by events beyond our reasonable control, including network outages, protocol failures, attacks, regulatory action and natural events. Electronic acceptance, including clicking Accept or signing with a wallet, is a valid signature.",
    ],
  },
  {
    title: "20. Contact",
    body: [
      "Questions about these Terms can be sent through the contact channels listed on startit.fun.",
    ],
  },
];
