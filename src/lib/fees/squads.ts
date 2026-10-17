import "server-only";
import { createHmac } from "node:crypto";
import * as multisig from "@sqds/multisig";
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { connection } from "@/lib/launch/launchlab";

export const SQUADS_PROGRAM = multisig.PROGRAM_ID;
export const MAX_TRANSFERS_PER_PROPOSAL = 8;

/** The Fee Router address we publish must be vault #0 of the configured Squads multisig. */
export function vaultOf(multisigPda: PublicKey) {
  return multisig.getVaultPda({ multisigPda, index: 0 })[0];
}

/**
 * Builds a Squads vault transaction + proposal that pays the given transfers from the Fee Router vault.
 * The proposing member signs in their wallet; execution still needs the multisig threshold in the Squads app.
 */
export async function buildPayoutProposal(p: { member: PublicKey; multisigPda: PublicKey; transfers: { to: PublicKey; lamports: bigint }[]; memo: string }) {
  if (!p.transfers.length || p.transfers.length > MAX_TRANSFERS_PER_PROPOSAL) throw new Error(`A proposal pays 1–${MAX_TRANSFERS_PER_PROPOSAL} recipients.`);
  const conn = connection();
  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, p.multisigPda);
  if (!ms.members.some((m) => m.key.equals(p.member))) throw new Error("The connected wallet isn't a member of the Fee Router multisig.");
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + BigInt(1);
  const vault = vaultOf(p.multisigPda);

  const total = p.transfers.reduce((a, t) => a + t.lamports, BigInt(0));
  const balance = BigInt(await conn.getBalance(vault, "confirmed"));
  const rentReserve = BigInt(await conn.getMinimumBalanceForRentExemption(0));
  if (total + rentReserve > balance) throw new Error(`The Fee Router holds ${balance} lamports; these payouts need ${total} plus a ${rentReserve}-lamport reserve.`);

  const { blockhash } = await conn.getLatestBlockhash("finalized");
  const inner = new TransactionMessage({
    payerKey: vault,
    recentBlockhash: blockhash,
    instructions: p.transfers.map((t) => SystemProgram.transfer({ fromPubkey: vault, toPubkey: t.to, lamports: t.lamports })),
  });
  const outer = new TransactionMessage({
    payerKey: p.member,
    recentBlockhash: blockhash,
    instructions: [
      multisig.instructions.vaultTransactionCreate({ multisigPda: p.multisigPda, transactionIndex, creator: p.member, vaultIndex: 0, ephemeralSigners: 0, transactionMessage: inner, memo: p.memo.slice(0, 120) }),
      multisig.instructions.proposalCreate({ multisigPda: p.multisigPda, transactionIndex, creator: p.member }),
    ],
  }).compileToV0Message();
  return { tx: new VersionedTransaction(outer), transactionIndex, vault: vault.toBase58(), totalLamports: total };
}

/** Binds a built proposal to the payouts it pays, so the signed transaction can't be swapped. */
export function proposalTicket(messageSha256: string, payoutIds: string[], transactionIndex: bigint) {
  const secret = process.env.PAYOUT_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error("PAYOUT_SIGNING_SECRET is not configured (32+ characters).");
  return createHmac("sha256", secret).update(`${messageSha256}|${[...payoutIds].sort().join(",")}|${transactionIndex}`).digest("hex");
}
