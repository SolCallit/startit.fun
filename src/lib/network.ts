/**
 * The one switch between Solana devnet and mainnet. Everything network-specific reads from here:
 * program choice, the value stored on launch rows, the wallet chain, explorer links and on-screen labels.
 *
 * Set NEXT_PUBLIC_SOLANA_NETWORK=mainnet (and redeploy) to switch. Anything else means devnet.
 * Mainnet launches additionally need MAINNET_LAUNCHES_ENABLED=true on the server (see assertLaunchesOpen).
 */
export type Network = "devnet" | "mainnet";
export type DbNetwork = "solana-devnet" | "solana-mainnet";

export const NETWORK: Network =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? process.env.SOLANA_NETWORK) === "mainnet" ? "mainnet" : "devnet";
export const IS_MAINNET = NETWORK === "mainnet";
export const DB_NETWORK: DbNetwork = IS_MAINNET ? "solana-mainnet" : "solana-devnet";
/** Wallet Standard chain id used when asking a wallet to sign. */
export const WALLET_CHAIN = IS_MAINNET ? "solana:mainnet" : "solana:devnet";
/** Short label for copy: "Solana" or "Solana devnet". */
export const NETWORK_LABEL = IS_MAINNET ? "Solana" : "Solana devnet";

const isDevnet = (n?: string | null) => (n ? n !== "solana-mainnet" && n !== "mainnet" : !IS_MAINNET);

/** Solscan link. Pass the row's own network for records, so old devnet coins keep devnet links after the switch. */
export function solscan(kind: "account" | "token" | "tx", value: string, network?: string | null) {
  return `https://solscan.io/${kind}/${value}${isDevnet(network) ? "?cluster=devnet" : ""}`;
}
export function explorer(kind: "address" | "tx", value: string, network?: string | null) {
  return `https://explorer.solana.com/${kind}/${value}${isDevnet(network) ? "?cluster=devnet" : ""}`;
}
