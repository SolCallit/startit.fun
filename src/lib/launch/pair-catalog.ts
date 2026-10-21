import "server-only";
import { cacheLife } from "next/cache";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { LaunchpadConfig, LAUNCHPAD_PROGRAM } from "@raydium-io/raydium-sdk-v2";
import { connection, LAUNCHLAB_PROGRAM } from "./launchlab";

export type PairNetwork = "devnet" | "mainnet";

/**
 * Where pairs come from: Raydium creates one LaunchLab GlobalConfig account per quote token. Any mint with a config
 * (constant-product curve, index 0) can be a launch's pair. We find them by scanning the LaunchLab program for
 * GlobalConfig-sized accounts, then name them with Jupiter's token list. Nothing is hard-coded.
 */

export type DiscoveredConfig = { configId: string; mint: string; curveType: number; index: number; tradeFeeRate: number };
export type PairCategory = "xstocks" | "prestocks" | "currencies" | "solana" | "majors" | "custom";
export type CatalogEntry = DiscoveredConfig & {
  symbol: string; name: string; decimals: number | null; logoUrl: string | null; tokenProgram: string | null; category: PairCategory;
};

export const CATEGORY_LABEL: Record<PairCategory, string> = {
  xstocks: "xStocks", prestocks: "PreStocks", currencies: "Currencies", solana: "Solana", majors: "Majors", custom: "Custom",
};

/**
 * Every quote-token config on the LaunchLab program. Devnet is where launches run today; mainnet is read so the
 * full catalog (xStocks, currencies, memecoins…) can be shown ahead of the mainnet switch.
 */
export async function discoverLaunchLabConfigs(network: PairNetwork = "devnet"): Promise<DiscoveredConfig[]> {
  "use cache";
  cacheLife("hours");
  const conn = network === "devnet" ? connection() : new Connection(process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta"), "confirmed");
  const program = network === "devnet" ? LAUNCHLAB_PROGRAM : LAUNCHPAD_PROGRAM;
  let out: DiscoveredConfig[] = [];
  try {
    const accounts = await conn.getProgramAccounts(program, { commitment: "confirmed", filters: [{ dataSize: LaunchpadConfig.span }] });
    for (const a of accounts) {
      try {
        const c = LaunchpadConfig.decode(a.account.data);
        out.push({
          configId: a.pubkey.toBase58(), mint: (c.mintB as PublicKey).toBase58(),
          curveType: Number(c.curveType), index: Number(c.index), tradeFeeRate: Number(c.tradeFeeRate.toString()),
        });
      } catch { /* another account type of the same size */ }
    }
  } catch (e) {
    // Public mainnet RPCs often refuse program-wide scans. Fall back to Raydium's own launch API.
    if (network === "devnet") throw e;
    out = await raydiumApiConfigs();
  }
  // We launch on the constant-product curve, index 0 (what configIdFor derives).
  return out.filter((c) => c.curveType === 0 && c.index === 0);
}

/** Raydium's launch API lists its LaunchLab configs. Parsed defensively: we only need config id + quote mint. */
async function raydiumApiConfigs(): Promise<DiscoveredConfig[]> {
  const res = await fetch("https://launch-mint-v1.raydium.io/main/configs", { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Raydium launch API returned ${res.status}`);
  const json: unknown = await res.json();
  const out: DiscoveredConfig[] = [];
  const b58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const key = (o.key && typeof o.key === "object" ? o.key : o) as Record<string, unknown>;
    const mint = key.mintB ?? (o.mintB as Record<string, unknown> | undefined)?.address ?? o.mintB;
    const id = key.pubKey ?? key.id ?? o.id;
    if (typeof mint === "string" && typeof id === "string" && b58.test(mint) && b58.test(id)) {
      out.push({ configId: id, mint, curveType: Number(key.curveType ?? 0), index: Number(key.index ?? 0), tradeFeeRate: Number(key.tradeFeeRate ?? 0) });
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(json);
  return [...new Map(out.map((c) => [c.configId, c])).values()];
}

type JupToken = { id: string; name?: string; symbol?: string; icon?: string; decimals?: number; tokenProgram?: string; tags?: string[] };

/** Names, symbols and logos from Jupiter's token API. Missing tokens (e.g. devnet mints) just come back unnamed. */
async function jupiterMeta(mints: string[]): Promise<Map<string, JupToken>> {
  const out = new Map<string, JupToken>();
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    try {
      const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${batch.join(",")}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const list = (await res.json()) as JupToken[];
      for (const t of list) if (t?.id && batch.includes(t.id)) out.set(t.id, t);
    } catch { /* metadata is optional */ }
  }
  return out;
}

const STABLES = new Set(["USDC", "USDT", "EURC", "PYUSD", "USD1", "USDG", "USDS", "FDUSD", "USDE", "AUSD", "USDY", "JLUSDC", "ONYC", "USX", "UXD"]);
const SOLANA = new Set(["SOL", "WSOL", "MSOL", "JITOSOL", "BSOL", "JUPSOL", "INF", "PSOL", "HSOL", "BNSOL", "DSOL", "VSOL"]);
const MAJORS = new Set(["CBBTC", "WBTC", "XBTC", "ZBTC", "TBTC", "ETH", "WETH", "BTC", "RAY", "JUP"]);

export function categorize(t: { symbol: string; name: string; tags?: string[] }): PairCategory {
  const sym = t.symbol.toUpperCase(), name = t.name.toLowerCase();
  if (name.includes("xstock")) return "xstocks";
  if (name.includes("prestock") || (t.tags ?? []).includes("prestocks")) return "prestocks";
  if (STABLES.has(sym) || (t.tags ?? []).includes("stablecoin")) return "currencies";
  if (SOLANA.has(sym) || (t.tags ?? []).includes("lst")) return "solana";
  if (MAJORS.has(sym)) return "majors";
  return "custom";
}

/** Discovered configs with names, logos and categories. */
export async function buildCatalog(network: PairNetwork = "devnet"): Promise<CatalogEntry[]> {
  const configs = await discoverLaunchLabConfigs(network);
  const meta = await jupiterMeta(configs.map((c) => c.mint));
  return configs.map((c) => {
    const m = meta.get(c.mint);
    const symbol = (m?.symbol ?? (c.mint === "So11111111111111111111111111111111111111112" ? "SOL" : c.mint.slice(0, 4))).slice(0, 12);
    const name = (m?.name ?? (symbol === "SOL" ? "Solana" : `Token ${c.mint.slice(0, 4)}…${c.mint.slice(-4)}`)).slice(0, 60);
    return {
      ...c, symbol, name,
      decimals: m?.decimals ?? null,
      logoUrl: m?.icon && m.icon.startsWith("https://") ? m.icon.slice(0, 1024) : null,
      tokenProgram: m?.tokenProgram ?? null,
      category: categorize({ symbol, name, tags: m?.tags }),
    };
  });
}
