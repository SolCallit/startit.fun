import "server-only";
import BN from "bn.js";
import { clusterApiUrl, Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  DEV_LAUNCHPAD_AUTH,
  DEV_LAUNCHPAD_PROGRAM,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  getPdaLaunchpadConfigId,
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

export const solGlobalConfigId = () => getPdaLaunchpadConfigId(LAUNCHLAB_PROGRAM, NATIVE_MINT, 0, 0).publicKey;
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

/** Builds the unsigned token launch. The mint's keypair stays in the operator's browser; only its public key comes here. */
export async function buildLaunchTx(p: {
  operator: PublicKey; mint: PublicKey; platformId: PublicKey; name: string; symbol: string; uri: string; decimals: number; supplyRaw: string;
}) {
  const r = await raydium(p.operator);
  const res = await r.launchpad.createLaunchpad({
    programId: LAUNCHLAB_PROGRAM,
    authProgramId: LAUNCHLAB_AUTH,
    platformId: p.platformId,
    configId: solGlobalConfigId(),
    mintA: p.mint,
    decimals: p.decimals,
    supply: new BN(p.supplyRaw),
    name: p.name,
    symbol: p.symbol,
    uri: p.uri,
    migrateType: "cpmm",
    buyAmount: new BN(0),
    createOnly: true,
    txVersion: TxVersion.V0,
    feePayer: p.operator,
  });
  const txs = res.transactions as unknown[];
  if (txs.length !== 1 || !(txs[0] instanceof VersionedTransaction)) throw new Error(`Expected one v0 launch transaction, SDK built ${txs.length}.`);
  return { tx: txs[0], poolId: res.extInfo.address.poolId.toBase58() };
}

/** Reads the mint after launch. */
export async function readMint(mint: PublicKey) {
  const info = await connection().getParsedAccountInfo(mint, "confirmed");
  const parsed = (info.value?.data as { parsed?: { info?: { supply: string; decimals: number; mintAuthority: string | null; freezeAuthority: string | null } } } | undefined)?.parsed?.info;
  if (!parsed) throw new Error("Mint account not found or not a token mint.");
  return { supplyRaw: parsed.supply, decimals: parsed.decimals, mintAuthority: parsed.mintAuthority ?? null, freezeAuthority: parsed.freezeAuthority ?? null };
}
