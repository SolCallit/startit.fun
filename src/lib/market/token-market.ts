import "server-only";
import { cacheLife } from "next/cache";
import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL } from "@/lib/launch/launchlab";
import { LaunchpadPool } from "@raydium-io/raydium-sdk-v2";

/** Reads fail fast on rate limits instead of retrying for seconds; the page shows what it has. */
const connection = () => new Connection(RPC_URL, { commitment: "confirmed", disableRetryOnRateLimit: true });
const MARKET_CACHE = { stale: 15, revalidate: 20, expire: 600 };

/**
 * Market data for a launched coin, read straight from the chain: the LaunchLab pool for price and curve progress,
 * the pool's own transactions for trades and candles, and the largest token accounts for holders.
 * Nothing here is estimated or simulated: if the chain can't be read, callers show "unavailable".
 */

export type PoolState = {
  status: number;
  graduated: boolean;
  priceQuote: number;          // quote token per 1 coin
  supply: number;              // whole coins
  marketCapQuote: number;      // priceQuote * supply
  raisedQuote: number;         // quote raised on the curve so far
  targetQuote: number;         // quote needed to graduate
  progress: number;            // 0..1
  vaultA: string;
  vaultB: string;
  decimalsA: number;
  decimalsB: number;
};

export type Trade = { sig: string; time: number; side: "buy" | "sell"; coins: number; quote: number; price: number; trader: string };
export type Holder = { owner: string; account: string; amount: number; pct: number; label?: string };

const num = (bn: { toString(): string }) => Number(bn.toString());

export async function getPoolState(pool: string): Promise<PoolState | null> {
  "use cache";
  cacheLife(MARKET_CACHE);
  const info = await connection().getAccountInfo(new PublicKey(pool), "confirmed");
  if (!info) return null;
  const p = LaunchpadPool.decode(info.data);
  const decA = Number(p.mintDecimalsA), decB = Number(p.mintDecimalsB);
  const vA = num(p.virtualA), vB = num(p.virtualB), rA = num(p.realA), rB = num(p.realB);
  // Constant-product curve: price = (virtualB + realB) / (virtualA - realA), adjusted for decimals.
  const priceQuote = ((vB + rB) / Math.max(1, vA - rA)) * 10 ** (decA - decB);
  const supply = num(p.supply) / 10 ** decA;
  const target = num(p.totalFundRaisingB) / 10 ** decB;
  const raised = rB / 10 ** decB;
  const status = Number(p.status);
  return {
    status, graduated: status !== 0,
    priceQuote, supply, marketCapQuote: priceQuote * supply,
    raisedQuote: raised, targetQuote: target, progress: target > 0 ? Math.min(1, raised / target) : 0,
    vaultA: (p.vaultA as PublicKey).toBase58(), vaultB: (p.vaultB as PublicKey).toBase58(), decimalsA: decA, decimalsB: decB,
  };
}

type TokenBal = { accountIndex: number; uiTokenAmount: { amount: string } };

/**
 * Recent buys and sells on the curve, newest first, from the pool's vault balance changes.
 * Public RPCs rate-limit transaction reads hard, so this reads the latest 120 in small sequential batches
 * and returns whatever it got if the RPC pushes back.
 */
export async function getTrades(pool: string, vaultA: string, vaultB: string, decA: number, decB: number): Promise<Trade[]> {
  "use cache";
  cacheLife(MARKET_CACHE);
  const conn = connection();
  const sigs = await conn.getSignaturesForAddress(new PublicKey(pool), { limit: 120 }, "confirmed");
  const ok = sigs.filter((s) => !s.err);
  const out: Trade[] = [];
  const BATCH = 10;
  for (let i = 0; i < ok.length; i += BATCH) {
    let txs;
    try {
      txs = await conn.getParsedTransactions(ok.slice(i, i + BATCH).map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    } catch {
      if (i === 0) throw new Error("trades unavailable");
      break;
    }
    txs.forEach((tx, k) => {
      if (!tx?.meta || !tx.blockTime) return;
      const keys = tx.transaction.message.accountKeys.map((a) => a.pubkey.toBase58());
      const ia = keys.indexOf(vaultA), ib = keys.indexOf(vaultB);
      if (ia < 0 || ib < 0) return;
      const bal = (list: TokenBal[] | null | undefined, idx: number) => Number(list?.find((b) => b.accountIndex === idx)?.uiTokenAmount.amount ?? 0);
      const dA = bal(tx.meta.postTokenBalances as TokenBal[], ia) - bal(tx.meta.preTokenBalances as TokenBal[], ia);
      const dB = bal(tx.meta.postTokenBalances as TokenBal[], ib) - bal(tx.meta.preTokenBalances as TokenBal[], ib);
      if (!dA || !dB) return;
      const coins = Math.abs(dA) / 10 ** decA, quote = Math.abs(dB) / 10 ** decB;
      out.push({ sig: ok[i + k]!.signature, time: tx.blockTime, side: dA < 0 ? "buy" : "sell", coins, quote, price: quote / coins, trader: keys[0] ?? "" });
    });
  }
  return out.sort((a, b) => b.time - a.time);
}

/** Largest holders. The pool's vault is labelled as the bonding curve. */
export async function getHolders(mint: string, supply: number, vaultA?: string): Promise<Holder[]> {
  "use cache";
  cacheLife("minutes");
  const conn = connection();
  const largest = await conn.getTokenLargestAccounts(new PublicKey(mint), "confirmed");
  const accounts = largest.value.filter((a) => Number(a.amount) > 0).slice(0, 20);
  const infos = await conn.getMultipleParsedAccounts(accounts.map((a) => a.address));
  return accounts.map((a, i) => {
    const owner = (infos.value[i]?.data as { parsed?: { info?: { owner?: string } } } | undefined)?.parsed?.info?.owner ?? a.address.toBase58();
    const amount = a.uiAmount ?? 0;
    return { owner, account: a.address.toBase58(), amount, pct: supply ? amount / supply : 0, label: a.address.toBase58() === vaultA ? "Bonding curve" : undefined };
  });
}

/** SOL in USD from Jupiter's price API (mainnet price; devnet SOL has no market value, shown for scale only). */
export async function getSolUsd(): Promise<number | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const res = await fetch("https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, { usdPrice?: number }>;
    return j["So11111111111111111111111111111111111111112"]?.usdPrice ?? null;
  } catch {
    return null;
  }
}
