import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { bpsToPercent, isDefaultSplit, type FeeSplit } from "@/lib/domain/fees";

export type SignerRole = "founder" | "launcher";

export type LaunchTermsInput = {
  publicRef: string;
  projectName: string;
  tokenName: string;
  ticker: string;
  network: "solana-devnet" | "solana-mainnet";
  totalSupply: string; // whole tokens, as a decimal string
  decimals: number;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  insiderAllocations: { holder: string; amount: string; note: string }[];
  split: FeeSplit;
  deviationReason: string | null;
  wallets: { founder: string; launcher: string | null; communityTreasury: string; feeRouter: string };
  treasury: { isMultisig: boolean; threshold: number | null; signers: string[]; controlRules: string };
  permittedBranding: string;
  /** The on-chain pair (bonding-curve quote token). Omitted = SOL. */
  quote?: { symbol: string; mint: string };
  /** Disclosed starter's buy by the applicant's wallet right after launch, in the pair token. Omitted = not part of these terms. */
  starterBuy?: { amount: string; symbol: string; wallet: string | null };
};

const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(v: string): boolean {
  if (!BASE58_PUBKEY.test(v)) return false;
  try {
    return bs58.decode(v).length === 32;
  } catch {
    return false;
  }
}

/**
 * The exact text every signer sees and signs (by hash). Deterministic: the same config always
 * renders the same bytes, so the hash identifies precisely what was agreed.
 */
export function renderLaunchTerms(t: LaunchTermsInput): string {
  const s = t.split;
  const lines = [
    `# Startit launch terms — ${t.projectName} ($${t.ticker})`,
    ``,
    `Application: ${t.publicRef}`,
    `Network: ${t.network === "solana-devnet" ? "Solana devnet (test network, no monetary value)" : "Solana mainnet"}`,
    `Launch mechanism: Raydium LaunchLab bonding curve, graduating to a Raydium CPMM pool`,
    `Paired with: ${t.quote ? `${t.quote.symbol} (${t.quote.mint})` : "SOL"} — trading, graduation and fees are counted in this token`,
    ``,
    `## Token`,
    `- Name: ${t.tokenName}`,
    `- Ticker: ${t.ticker}`,
    `- Total supply: ${t.totalSupply} tokens, ${t.decimals} decimals`,
    `- Mint authority: ${t.mintAuthorityRevoked ? "no person or team holds it. After launch it is either revoked or held only by the Raydium LaunchLab program, verified on-chain" : "RETAINED — more tokens can be created"}`,
    `- Freeze authority: ${t.freezeAuthorityRevoked ? "none — no wallet can be frozen, verified on-chain after launch" : "RETAINED — wallets can be frozen"}`,
    `- Permitted branding: ${t.permittedBranding}`,
    ``,
    `## Insider holdings at launch`,
    ...(t.insiderAllocations.length
      ? t.insiderAllocations.map((a) => `- ${a.holder}: ${a.amount} tokens — ${a.note}`)
      : [`- None. No builder, team, launcher or Startit allocation.`]),
    ...(t.starterBuy
      ? [Number(t.starterBuy.amount) > 0
          ? `- Starter's buy: up to ${t.starterBuy.amount} ${t.starterBuy.symbol} of $${t.ticker}, bought on the bonding curve by ${t.starterBuy.wallet ?? "the applicant's wallet"} right after launch, as its own transaction.`
          : `- Starter's buy: none.`]
      : []),
    ``,
    `## Trading fees`,
    `Shares of trading fees Startit actually collects (not trading volume):`,
    `- Community treasury: ${bpsToPercent(s.communityBps)}`,
    `- Builder: ${bpsToPercent(s.founderBps)}`,
    `- Launcher: ${bpsToPercent(s.launcherBps)}`,
    `- Startit platform: ${bpsToPercent(s.platformBps)}`,
    ...(isDefaultSplit(s) ? [] : [`- Non-standard split, approved because: ${t.deviationReason ?? "(no reason recorded)"}`]),
    `Fees are collected into the Startit Fee Router (${t.wallets.feeRouter}), a multisig, and paid out from there.`,
    `Raydium charges its own protocol fee separately; it is not part of this split.`,
    ``,
    `## Payout wallets`,
    `- Builder: ${t.wallets.founder}`,
    `- Launcher: ${t.wallets.launcher ?? "none (the builder launched this themselves)"}`,
    `- Community treasury: ${t.wallets.communityTreasury}`,
    ``,
    `## Community treasury control`,
    `- ${t.treasury.isMultisig ? `${t.treasury.threshold}-of-${t.treasury.signers.length} multisig` : "Single-signer wallet"}`,
    ...(t.treasury.signers.length ? [`- Signers: ${t.treasury.signers.join(", ")}`] : []),
    `- Rules: ${t.treasury.controlRules}`,
    ``,
    `## Acknowledgements`,
    `- The builder's approval does not make the builder the owner or controller of the token.`,
    `- Nobody may promise or imply price appreciation; product milestones are not promises of token returns.`,
    `- Everything above is published on the project's public page before launch.`,
    `- Launcher rewards start only after launch and are forfeited if the project is suspended for misrepresentation.`,
    `- Startit may pause payouts if collections and payouts don't reconcile.`,
  ];
  return lines.join("\n") + "\n";
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Human-readable message the wallet shows. It commits to the terms hash, the role and the wallet. */
export function signingMessage(p: { publicRef: string; role: SignerRole; termsSha256: string; wallet: string; issuedAt: string }): string {
  return [
    "Startit — sign launch terms",
    "",
    `Application: ${p.publicRef}`,
    `Signing as: ${p.role}`,
    `Wallet: ${p.wallet}`,
    `Terms SHA-256: ${p.termsSha256}`,
    `Issued at: ${p.issuedAt}`,
    "",
    "I have read and accept these launch terms.",
    "This signature is not a transaction and cannot move funds.",
  ].join("\n");
}

/** Strict Ed25519 verification of a wallet's signMessage output. */
export function verifyWalletSignature(message: string, signatureBase58: string, walletBase58: string): boolean {
  try {
    if (!isSolanaAddress(walletBase58)) return false;
    const sig = bs58.decode(signatureBase58);
    if (sig.length !== 64) return false;
    return ed25519.verify(sig, new TextEncoder().encode(message), bs58.decode(walletBase58), { zip215: false });
  } catch {
    return false;
  }
}
