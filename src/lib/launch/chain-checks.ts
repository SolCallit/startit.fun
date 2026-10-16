import { createHash } from "node:crypto";
import type { VersionedTransaction } from "@solana/web3.js";

export type MintState = { supplyRaw: string; decimals: number; mintAuthority: string | null; freezeAuthority: string | null };

/**
 * Post-launch verification of the token mint against the signed terms.
 * Freeze authority must be gone. Mint authority must be gone or held only by an allowed program PDA.
 */
export function evaluateMintState(
  actual: MintState,
  expected: { supplyRaw: string; decimals: number; allowedMintAuthorities: string[] },
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (actual.freezeAuthority !== null) problems.push(`Freeze authority is held by ${actual.freezeAuthority}; the terms say no one can freeze wallets.`);
  if (actual.mintAuthority !== null && !expected.allowedMintAuthorities.includes(actual.mintAuthority)) {
    problems.push(`Mint authority is held by ${actual.mintAuthority}, which is not the LaunchLab program.`);
  }
  if (actual.decimals !== expected.decimals) problems.push(`Decimals are ${actual.decimals}, terms say ${expected.decimals}.`);
  if (BigInt(actual.supplyRaw) !== BigInt(expected.supplyRaw)) problems.push(`Supply is ${actual.supplyRaw} raw units, terms say ${expected.supplyRaw}.`);
  return { ok: problems.length === 0, problems };
}

export const messageSha256 = (tx: VersionedTransaction) => createHash("sha256").update(tx.message.serialize()).digest("hex");

/** What the operator sees before confirming. Derived from the transaction itself, not from our own claims. */
export function summarizeTransaction(tx: VersionedTransaction) {
  const keys = tx.message.staticAccountKeys;
  const header = tx.message.header;
  return {
    messageSha256: messageSha256(tx),
    feePayer: keys[0]?.toBase58() ?? null,
    requiredSigners: keys.slice(0, header.numRequiredSignatures).map((k) => k.toBase58()),
    programs: [...new Set(tx.message.compiledInstructions.map((ix) => keys[ix.programIdIndex]?.toBase58() ?? `lookup#${ix.programIdIndex}`))],
    instructionCount: tx.message.compiledInstructions.length,
    usesLookupTables: tx.message.addressTableLookups.length > 0,
    recentBlockhash: tx.message.recentBlockhash,
  };
}

/**
 * A signed transaction may be broadcast only if its message is byte-for-byte the one the operator confirmed,
 * and it carries a valid-looking signature from every required signer.
 */
export function assertMatchesConfirmed(signed: VersionedTransaction, confirmedMessageSha256: string) {
  if (messageSha256(signed) !== confirmedMessageSha256) throw new Error("The signed transaction is not the one that was previewed and confirmed.");
  const n = signed.message.header.numRequiredSignatures;
  const missing = signed.signatures.slice(0, n).some((s) => s.every((b) => b === 0));
  if (missing) throw new Error("The transaction is missing a required signature.");
}
