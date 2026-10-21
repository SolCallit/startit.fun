import "server-only";
import BN from "bn.js";
import { clusterApiUrl, Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  createPlatformAllowConfigIns,
  DEV_LAUNCHPAD_AUTH,
  DEV_LAUNCHPAD_PROGRAM,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  getPdaLaunchpadConfigId,
  getPdaPlatformAllowConfig,
  getPdaPlatformId,
  LaunchpadConfig,
  Raydium,
  TxVersion,
} from "@raydium-io/raydium-sdk-v2";

/**
 * Raydium LaunchLab integration — DEVNET ONLY until the external review.
 * The server only BUILDS unsigned transactions. Every signature happens in the operator's wallet in the browser.
 */
export const LAUNCHLAB_PROGRAM = DEV_LAUNCHPAD_PROGRAM;
export const LAUNCHLAB_AUTH = DEV_LAUNCHPAD_AUTH;
export const CPMM_PROGRAM = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;

/** Pump.fun charges traders 1.25% on the bonding curve; we target the same total. Units: 1/1,000,000. */
export const TARGET_TOTAL_TRADE_FEE = 12_500;
export const MAX_PLATFORM_FEE = 50_000; // LaunchLab cap (500 bps)
export const LP_SCALE_ALL_TO_PLATFORM = { platformScale: new BN(1_000_000), creatorScale: new BN(0), burnScale: new BN(0) };

export function connection() {
  return new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"), "confirmed");
}

async function raydium(owner: PublicKey) {
  return Raydium.load({ connection: connection(), owner, cluster: "devnet", disableFeatureCheck: true, disableLoadToken: true, blockhashCommitment: "finalized" });
}

export const SOL_MINT = NATIVE_MINT.toBase58();
/** Raydium's LaunchLab global config for a quote token (constant-product curve, index 0). */
export const configIdFor = (quoteMint: PublicKey) => getPdaLaunchpadConfigId(LAUNCHLAB_PROGRAM, quoteMint, 0, 0).publicKey;
export const solGlobalConfigId = () => configIdFor(NATIVE_MINT);
export const allowConfigIdFor = (platformId: PublicKey, configId: PublicKey) => getPdaPlatformAllowConfig(LAUNCHLAB_PROGRAM, platformId, configId).publicKey;

/**
 * Checks on-chain that Raydium has a LaunchLab config for this quote token, and reads the token's decimals.
 * Throws a plain-language error when Raydium hasn't enabled the token.
 */
export async function readQuoteConfig(quoteMint: PublicKey) {
  const conn = connection();
  const configId = configIdFor(quoteMint);
  const [cfgInfo, mintInfo] = await Promise.all([conn.getAccountInfo(configId), conn.getParsedAccountInfo(quoteMint)]);
  if (!cfgInfo) throw new Error(`Raydium hasn't enabled ${quoteMint.toBase58()} as a LaunchLab quote token on this network (no config at ${configId.toBase58()}).`);
  if (!cfgInfo.owner.equals(LAUNCHLAB_PROGRAM)) throw new Error("The config account isn't owned by the LaunchLab program.");
  const cfg = LaunchpadConfig.decode(cfgInfo.data);
  if (!cfg.mintB.equals(quoteMint)) throw new Error("The LaunchLab config is for a different quote token.");
  const parsed = (mintInfo.value?.data as { parsed?: { type?: string; info?: { decimals: number } } } | undefined)?.parsed;
  if (parsed?.type !== "mint" || parsed.info?.decimals === undefined) throw new Error("That address isn't a token mint.");
  return { configId: configId.toBase58(), decimals: parsed.info.decimals, tradeFeeRate: cfg.tradeFeeRate.toNumber(), mintBProgram: mintInfo.value!.owner.toBase58() };
}

/** Admin: allow one of Raydium's quote-token configs on Startit's platform. */
export async function buildAllowQuoteTx(p: { admin: PublicKey; platformId: PublicKey; configId: PublicKey }) {
  const allow = allowConfigIdFor(p.platformId, p.configId);
  const ix = createPlatformAllowConfigIns(LAUNCHLAB_PROGRAM, p.admin, p.platformId, p.configId, allow);
  const { blockhash } = await connection().getLatestBlockhash("finalized");
  const msg = new TransactionMessage({ payerKey: p.admin, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
  return { txBase64: Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64"), allowConfigId: allow.toBase58() };
}
export const platformIdFor = (admin: PublicKey) => getPdaPlatformId(LAUNCHLAB_PROGRAM, admin).publicKey;

/** Reads Raydium's own LaunchLab trade fee from the on-chain global config (not from docs or memory). */
export async function readRaydiumTradeFee(): Promise<{ tradeFeeRate: number; migrateFeeLamports: string; configId: string }> {
  const id = solGlobalConfigId();
  const info = await connection().getAccountInfo(id);
  if (!info) throw new Error(`LaunchLab global config ${id.toBase58()} not found on devnet.`);
  const cfg = LaunchpadConfig.decode(info.data);
  return { tradeFeeRate: cfg.tradeFeeRate.toNumber(), migrateFeeLamports: cfg.migrateFee.toString(), configId: id.toBase58() };
}

export function platformFeeFor(raydiumTradeFeeRate: number) {
  return Math.max(0, Math.min(MAX_PLATFORM_FEE, TARGET_TOTAL_TRADE_FEE - raydiumTradeFeeRate));
}

function toBase64(tx: unknown) {
  if (!(tx instanceof VersionedTransaction)) throw new Error("Expected a v0 transaction from the Raydium SDK.");
  return Buffer.from(tx.serialize()).toString("base64");
}

/** One-time: create Startit's LaunchLab platform. Fees, LP Fee Keys and vesting all route to the Fee Router. */
export async function buildCreatePlatformTx(p: { admin: PublicKey; feeRouter: PublicKey; siteUrl: string; imageUrl: string }) {
  const { tradeFeeRate } = await readRaydiumTradeFee();
  const feeRate = platformFeeFor(tradeFeeRate);
  const r = await raydium(p.admin);
  const cpConfigId = getCpmmPdaAmmConfigId(CPMM_PROGRAM, 0).publicKey;
  const { transaction, extInfo } = await r.launchpad.createPlatformConfig({
    programId: LAUNCHLAB_PROGRAM,
    platformAdmin: p.admin,
    platformClaimFeeWallet: p.feeRouter,
    platformLockNftWallet: p.feeRouter,
    platformVestingWallet: p.feeRouter,
    cpConfigId,
    migrateCpLockNftScale: LP_SCALE_ALL_TO_PLATFORM,
    transferFeeExtensionAuth: p.feeRouter,
    creatorFeeRate: new BN(0),
    feeRate: new BN(feeRate),
    name: "Startit",
    web: p.siteUrl,
    img: p.imageUrl,
    platformVestingScale: new BN(0),
    txVersion: TxVersion.V0,
    feePayer: p.admin,
  });
  return { txBase64: toBase64(transaction), platformId: extInfo.platformId.toBase58(), feeRate, raydiumTradeFeeRate: tradeFeeRate, cpConfigId: cpConfigId.toBase58() };
}

/** Redirect post-graduation CPMM creator fees to the Fee Router (applies to future migrations only). */
export async function buildRedirectCpCreatorTx(p: { admin: PublicKey; feeRouter: PublicKey }) {
  const r = await raydium(p.admin);
  const { transaction } = await r.launchpad.updatePlatformConfig({
    programId: LAUNCHLAB_PROGRAM,
    platformAdmin: p.admin,
    platformId: platformIdFor(p.admin),
    updateInfo: { type: "updatePlatformCpCreator", value: p.feeRouter },
    txVersion: TxVersion.V0,
    feePayer: p.admin,
  });
  return { txBase64: toBase64(transaction) };
}

/**
 * Builds the unsigned token launch. The mint's keypair stays in the signer's browser; only its public key comes here.
 * With a starter's buy, the same transaction creates the coin and makes the buy, so nobody can trade in between.
 */
export async function buildLaunchTx(p: {
  operator: PublicKey; mint: PublicKey; platformId: PublicKey; name: string; symbol: string; uri: string; decimals: number; supplyRaw: string;
  /** The on-chain pair. Defaults to SOL. */
  quoteMint?: PublicKey;
  /** Starter's buy in raw quote units, paid by the signer. "0" or absent = create only. */
  buyAmountRaw?: string;
}) {
  const buy = new BN(p.buyAmountRaw ?? "0");
  const quote = p.quoteMint ?? NATIVE_MINT;
  const isSol = quote.equals(NATIVE_MINT);
  const r = await raydium(p.operator);
  const res = await r.launchpad.createLaunchpad({
    programId: LAUNCHLAB_PROGRAM,
    authProgramId: LAUNCHLAB_AUTH,
    platformId: p.platformId,
    configId: configIdFor(quote),
    // The quote token comes from the config; non-SOL configs must be allow-listed on our platform.
    ...(isSol ? {} : { platformAllowConfig: true }),
    mintA: p.mint,
    decimals: p.decimals,
    supply: new BN(p.supplyRaw),
    name: p.name,
    symbol: p.symbol,
    uri: p.uri,
    migrateType: "cpmm",
    buyAmount: buy,
    createOnly: buy.lten(0),
    // The first buy on a brand-new curve can't be front-run inside one transaction; 1% covers rounding.
    slippage: new BN(100),
    txVersion: TxVersion.V0,
    feePayer: p.operator,
  });
  const txs = res.transactions as unknown[];
  if (txs.length !== 1 || !(txs[0] instanceof VersionedTransaction)) {
    throw new Error(`Expected one launch transaction but the Raydium SDK split it into ${txs.length}; launch and starter's buy must be atomic.`);
  }
  return { tx: txs[0], poolId: res.extInfo.address.poolId.toBase58() };
}

/** Reads the mint after launch. */
export async function readMint(mint: PublicKey) {
  const info = await connection().getParsedAccountInfo(mint, "confirmed");
  const parsed = (info.value?.data as { parsed?: { info?: { supply: string; decimals: number; mintAuthority: string | null; freezeAuthority: string | null } } } | undefined)?.parsed?.info;
  if (!parsed) throw new Error("Mint account not found or not a token mint.");
  return { supplyRaw: parsed.supply, decimals: parsed.decimals, mintAuthority: parsed.mintAuthority ?? null, freezeAuthority: parsed.freezeAuthority ?? null };
}

/** The launcher's starter's buy: a plain bonding-curve buy from their own wallet, built unsigned for them to sign. */
export async function buildStarterBuyTx(p: { buyer: PublicKey; mint: PublicKey; quoteMint: PublicKey; amountRaw: string; slippageBps?: number }) {
  const r = await raydium(p.buyer);
  const res = await r.launchpad.buyToken({
    programId: LAUNCHLAB_PROGRAM,
    authProgramId: LAUNCHLAB_AUTH,
    mintA: p.mint,
    mintB: p.quoteMint,
    buyAmount: new BN(p.amountRaw),
    slippage: new BN(p.slippageBps ?? 300),
    txVersion: TxVersion.V0,
    feePayer: p.buyer,
  });
  if (!(res.transaction instanceof VersionedTransaction)) throw new Error("Expected a v0 buy transaction from the Raydium SDK.");
  return res.transaction;
}

/** Any wallet's buy or sell on a LaunchLab curve, built unsigned for that wallet to sign. Amounts are raw units. */
export async function buildTradeTx(p: { wallet: PublicKey; mint: PublicKey; quoteMint: PublicKey; side: "buy" | "sell"; amountRaw: string; slippageBps?: number }) {
  const r = await raydium(p.wallet);
  const common = { programId: LAUNCHLAB_PROGRAM, authProgramId: LAUNCHLAB_AUTH, mintA: p.mint, mintB: p.quoteMint, slippage: new BN(p.slippageBps ?? 300), txVersion: TxVersion.V0, feePayer: p.wallet };
  const res = p.side === "buy"
    ? await r.launchpad.buyToken({ ...common, buyAmount: new BN(p.amountRaw) })
    : await r.launchpad.sellToken({ ...common, sellAmount: new BN(p.amountRaw) });
  if (!(res.transaction instanceof VersionedTransaction)) throw new Error("Expected a v0 transaction from the Raydium SDK.");
  return res.transaction;
}
