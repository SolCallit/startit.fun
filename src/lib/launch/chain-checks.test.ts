import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { assertMatchesConfirmed, evaluateMintState, messageSha256, summarizeTransaction } from "./chain-checks";

const LAUNCHPAD_AUTH = "5xqNaZXX5eUi4p5HU4oz9i5QnwRNT2y6oN7yyn4qENeq";
const expected = { supplyRaw: "1000000000000000", decimals: 6, allowedMintAuthorities: [LAUNCHPAD_AUTH] };

describe("evaluateMintState", () => {
  it("passes when authorities are gone and supply matches", () => {
    expect(evaluateMintState({ supplyRaw: "1000000000000000", decimals: 6, mintAuthority: null, freezeAuthority: null }, expected).ok).toBe(true);
  });
  it("passes when the LaunchLab program holds mint authority", () => {
    expect(evaluateMintState({ supplyRaw: "1000000000000000", decimals: 6, mintAuthority: LAUNCHPAD_AUTH, freezeAuthority: null }, expected).ok).toBe(true);
  });
  it("fails when a person holds mint or freeze authority", () => {
    const someone = Keypair.generate().publicKey.toBase58();
    const r = evaluateMintState({ supplyRaw: "1000000000000000", decimals: 6, mintAuthority: someone, freezeAuthority: someone }, expected);
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(2);
  });
  it("fails on supply or decimals mismatch", () => {
    expect(evaluateMintState({ supplyRaw: "1", decimals: 9, mintAuthority: null, freezeAuthority: null }, expected).problems).toHaveLength(2);
  });
});

function tx(payer: Keypair, extra: Keypair, lamports = 1) {
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: new PublicKey(new Uint8Array(32).fill(7)).toBase58(),
    instructions: [SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: extra.publicKey, lamports, space: 0, programId: SystemProgram.programId })],
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

describe("transaction confirmation binding", () => {
  const payer = Keypair.generate(), mint = Keypair.generate();
  it("summarises signers and programs from the transaction itself", () => {
    const s = summarizeTransaction(tx(payer, mint));
    expect(s.feePayer).toBe(payer.publicKey.toBase58());
    expect(s.requiredSigners).toEqual([payer.publicKey.toBase58(), mint.publicKey.toBase58()]);
    expect(s.programs).toEqual([SystemProgram.programId.toBase58()]);
  });
  it("accepts the confirmed transaction once fully signed", () => {
    const t = tx(payer, mint);
    const confirmed = messageSha256(t);
    t.sign([payer, mint]);
    expect(() => assertMatchesConfirmed(t, confirmed)).not.toThrow();
  });
  it("rejects a different transaction even if properly signed", () => {
    const confirmed = messageSha256(tx(payer, mint, 1));
    const swapped = tx(payer, mint, 999);
    swapped.sign([payer, mint]);
    expect(() => assertMatchesConfirmed(swapped, confirmed)).toThrow(/not the one that was previewed/);
  });
  it("rejects a transaction missing the mint signature", () => {
    const t = tx(payer, mint);
    const confirmed = messageSha256(t);
    t.sign([payer]);
    expect(() => assertMatchesConfirmed(t, confirmed)).toThrow(/missing a required signature/);
  });
});
