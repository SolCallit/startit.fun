"use client";

import { WALLET_CHAIN } from "@/lib/network";
import { useEffect, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import { SolanaSignTransaction, type SolanaSignTransactionFeature } from "@solana/wallet-standard-features";

export type TxWallet = Wallet & { features: StandardConnectFeature & SolanaSignTransactionFeature };

const canSignTx = (w: Wallet): w is TxWallet =>
  StandardConnect in w.features && SolanaSignTransaction in w.features && w.chains.some((c) => c.startsWith("solana:"));

/** Minimal Wallet Standard hook: discover wallets, connect, sign (never send) transactions. */
export function useTxWallet() {
  const [wallets, setWallets] = useState<TxWallet[]>([]);
  const [conn, setConn] = useState<{ wallet: TxWallet; account: WalletAccount } | null>(null);

  useEffect(() => {
    const api = getWallets();
    const refresh = () => setWallets(api.get().filter(canSignTx));
    refresh();
    const a = api.on("register", refresh), b = api.on("unregister", refresh);
    return () => { a(); b(); };
  }, []);

  async function connect(w: TxWallet) {
    const { accounts } = await w.features[StandardConnect].connect();
    if (!accounts[0]) throw new Error("The wallet didn't share an account.");
    setConn({ wallet: w, account: accounts[0] });
    return accounts[0].address;
  }

  async function signTransaction(tx: Uint8Array): Promise<Uint8Array> {
    if (!conn) throw new Error("Connect a wallet first.");
    const [out] = await conn.wallet.features[SolanaSignTransaction].signTransaction({ account: conn.account, transaction: tx, chain: WALLET_CHAIN });
    if (!out) throw new Error("The wallet returned nothing.");
    return out.signedTransaction;
  }

  return { wallets, address: conn?.account.address ?? null, walletName: conn?.wallet.name ?? null, connect, signTransaction, disconnect: () => setConn(null) };
}
