"use server";

import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { DB_NETWORK } from "@/lib/network";
import { getPublicProject } from "@/lib/data/public";
import { getPoolState } from "./token-market";
import { summarizeTransaction } from "@/lib/launch/chain-checks";
import { buildTradeTx, connection, LAUNCHLAB_PROGRAM, SOL_MINT } from "@/lib/launch/launchlab";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

const ALLOWED = new Set([
  LAUNCHLAB_PROGRAM.toBase58(), "11111111111111111111111111111111", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "ComputeBudget111111111111111111111111111111",
]);

const toRaw = (amount: string, decimals: number) => {
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("Enter a number.");
  const [w, f = ""] = amount.split(".");
  return (BigInt(w || "0") * BigInt(10) ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
};

async function liveCoin(ref: string) {
  const data = await getPublicProject(ref);
  const p = data?.project;
  if (!p || p.status !== "launched" || !p.mint_address) throw new Error("This coin isn't live yet.");
  if ((p.network ?? "solana-devnet") !== DB_NETWORK) throw new Error("This coin lives on another Solana network and can't be traded from here.");
  return p;
}

/** Builds a buy (amount in the pair token) or a sell (amount in coins) for the connected wallet to sign. */
export async function prepareTrade(ref: string, wallet: string, side: "buy" | "sell", amount: string, slippageBps = 300): Promise<Result<{ txBase64: string }>> {
  try {
    const p = await liveCoin(ref);
    const quote = p.quote_mint ?? SOL_MINT;
    const pool = p.launchlab_pool_address ? await getPoolState(p.launchlab_pool_address) : null;
    if (pool?.graduated) throw new Error("This coin graduated to Raydium. Trade it there.");
    const decimals = side === "buy" ? (pool?.decimalsB ?? 9) : (pool?.decimalsA ?? p.decimals ?? 6);
    const raw = toRaw(amount.trim(), decimals);
    if (BigInt(raw) <= BigInt(0)) throw new Error("Enter an amount above zero.");
    const tx = await buildTradeTx({ wallet: new PublicKey(wallet), mint: new PublicKey(p.mint_address!), quoteMint: new PublicKey(quote), side, amountRaw: raw, slippageBps: Math.min(5000, Math.max(10, slippageBps)) });
    return { ok: true, txBase64: Buffer.from(tx.serialize()).toString("base64") };
  } catch (e) { return fail(e); }
}

/** Broadcasts a signed trade, only if it's a plain LaunchLab trade paid by the signer. */
export async function sendTrade(ref: string, wallet: string, signedBase64: string): Promise<Result<{ signature: string }>> {
  try {
    await liveCoin(ref);
    const tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
    const s = summarizeTransaction(tx);
    if (s.feePayer !== wallet) throw new Error("This transaction isn't paid by your wallet.");
    if (!s.programs.includes(LAUNCHLAB_PROGRAM.toBase58()) || s.programs.some((x) => !ALLOWED.has(x))) throw new Error("That isn't a plain LaunchLab trade.");
    const conn = connection();
    const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    const latest = await conn.getLatestBlockhash("confirmed");
    const conf = await conn.confirmTransaction({ signature, ...latest }, "confirmed");
    if (conf.value.err) throw new Error(`The trade failed on-chain: ${JSON.stringify(conf.value.err)}`);
    return { ok: true, signature };
  } catch (e) { return fail(e); }
}
