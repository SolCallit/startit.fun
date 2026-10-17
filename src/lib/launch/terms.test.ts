import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { DEFAULT_SPLIT } from "@/lib/domain/fees";
import { isSolanaAddress, renderLaunchTerms, sha256Hex, signingMessage, verifyWalletSignature, type LaunchTermsInput } from "./terms";

const sk = ed25519.utils.randomSecretKey();
const wallet = bs58.encode(ed25519.getPublicKey(sk));
const other = bs58.encode(ed25519.getPublicKey(ed25519.utils.randomSecretKey()));

const input: LaunchTermsInput = {
  publicRef: "STI-2026-000001", projectName: "NeuroForge", tokenName: "Forge", ticker: "FORGE", network: "solana-devnet",
  totalSupply: "1000000000", decimals: 6, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, insiderAllocations: [],
  split: DEFAULT_SPLIT, deviationReason: null,
  wallets: { founder: wallet, launcher: other, communityTreasury: other, feeRouter: other },
  treasury: { isMultisig: true, threshold: 2, signers: [wallet, other, other], controlRules: "Spending needs 2 of 3 signers." },
  permittedBranding: "Product name and logo",
};

describe("launch terms", () => {
  it("renders deterministically and states the split, authorities and insiders", async () => {
    const a = renderLaunchTerms(input), b = renderLaunchTerms(input);
    expect(a).toBe(b);
    expect(await sha256Hex(a)).toBe(await sha256Hex(b));
    expect(a).toContain("Community treasury: 50%");
    expect(a).toContain("Launcher: 5%");
    expect(a).toContain("Mint authority: no person or team holds it");
    expect(a).toContain("None. No builder, team, launcher or Startit allocation.");
    expect(a).toContain("test network");
  });
  it("calls out retained authorities and non-standard splits loudly", () => {
    const t = renderLaunchTerms({ ...input, mintAuthorityRevoked: false, split: { platformBps: 1000, founderBps: 3500, launcherBps: 500, communityBps: 5000 }, deviationReason: "Founder seeds liquidity" });
    expect(t).toContain("RETAINED — more tokens can be created");
    expect(t).toContain("Non-standard split, approved because: Founder seeds liquidity");
  });
  it("any change to the terms changes the hash", async () => {
    expect(await sha256Hex(renderLaunchTerms(input))).not.toBe(await sha256Hex(renderLaunchTerms({ ...input, totalSupply: "1000000001" })));
  });
});

describe("wallet signatures", () => {
  const msg = signingMessage({ publicRef: "STI-2026-000001", role: "founder", termsSha256: "ab".repeat(32), wallet, issuedAt: "2026-10-16T21:00:00.000Z" });
  const sig = bs58.encode(ed25519.sign(new TextEncoder().encode(msg), sk));

  it("verifies a genuine signature", () => expect(verifyWalletSignature(msg, sig, wallet)).toBe(true));
  it("rejects the right signature from the wrong wallet", () => expect(verifyWalletSignature(msg, sig, other)).toBe(false));
  it("rejects a signature over different terms", () => {
    expect(verifyWalletSignature(msg.replace("ab".repeat(32), "cd".repeat(32)), sig, wallet)).toBe(false);
  });
  it("rejects garbage", () => {
    expect(verifyWalletSignature(msg, "notbase58!!", wallet)).toBe(false);
    expect(verifyWalletSignature(msg, sig, "not-a-wallet")).toBe(false);
  });
  it("validates addresses", () => {
    expect(isSolanaAddress(wallet)).toBe(true);
    expect(isSolanaAddress("0OIl" + wallet.slice(4))).toBe(false);
  });
});
