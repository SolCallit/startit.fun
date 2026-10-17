"use client";

import { useEffect, useState } from "react";
import bs58 from "bs58";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import { signingMessage, type SignerRole } from "@/lib/launch/terms";
import { submitSignature } from "@/lib/launch/actions";

type SignableWallet = Wallet & { features: StandardConnectFeature & SolanaSignMessageFeature };

const isSignable = (w: Wallet): w is SignableWallet =>
  StandardConnect in w.features && SolanaSignMessage in w.features && w.chains.some((c) => c.startsWith("solana:"));

export function WalletSign(props: { token: string; role: SignerRole; publicRef: string; termsSha256: string; expectedWallet: string }) {
  const [wallets, setWallets] = useState<SignableWallet[]>([]);
  const [account, setAccount] = useState<{ wallet: SignableWallet; account: WalletAccount } | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "working" | "done" | "error"; text?: string }>({ kind: "idle" });

  useEffect(() => {
    const api = getWallets();
    const refresh = () => setWallets(api.get().filter(isSignable));
    refresh();
    const off1 = api.on("register", refresh);
    const off2 = api.on("unregister", refresh);
    return () => { off1(); off2(); };
  }, []);

  async function connect(w: SignableWallet) {
    setStatus({ kind: "working", text: `Connecting to ${w.name}…` });
    try {
      const { accounts } = await w.features[StandardConnect].connect();
      const acct = accounts.find((a) => a.address === props.expectedWallet) ?? accounts[0];
      if (!acct) throw new Error("The wallet didn't share an account.");
      setAccount({ wallet: w, account: acct });
      setStatus(acct.address === props.expectedWallet ? { kind: "idle" } : {
        kind: "error",
        text: `Connected ${acct.address.slice(0, 4)}…${acct.address.slice(-4)}, but this link must be signed by the wallet ending ${props.expectedWallet.slice(-6)}. Switch accounts in your wallet and reconnect.`,
      });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Couldn't connect." });
    }
  }

  async function sign() {
    if (!account) return;
    setStatus({ kind: "working", text: "Approve the message in your wallet…" });
    try {
      const issuedAt = new Date().toISOString();
      const message = signingMessage({ publicRef: props.publicRef, role: props.role, termsSha256: props.termsSha256, wallet: account.account.address, issuedAt });
      const [out] = await account.wallet.features[SolanaSignMessage].signMessage({ account: account.account, message: new TextEncoder().encode(message) });
      if (!out) throw new Error("The wallet returned no signature.");
      setStatus({ kind: "working", text: "Verifying…" });
      const res = await submitSignature(props.token, { wallet: account.account.address, signature: bs58.encode(out.signature), issuedAt });
      setStatus(res.ok ? { kind: "done", text: "Signed. Startit has recorded your signature. You can close this page." } : { kind: "error", text: res.error });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Signing was cancelled." });
    }
  }

  if (status.kind === "done") return <p role="status" className="rounded-md border border-verified/40 bg-verified-soft px-4 py-3 font-semibold text-verified">{status.text}</p>;

  const right = account?.account.address === props.expectedWallet;
  return (
    <div className="flex flex-col gap-4">
      {!account ? (
        wallets.length ? (
          <div className="flex flex-wrap gap-2">
            {wallets.map((w) => (
              <button key={w.name} type="button" onClick={() => connect(w)}
                className="inline-flex items-center gap-2 btn-chrome">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" width={20} height={20} className="rounded" />
                Connect {w.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-ink-soft">No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, or open this link inside your wallet&apos;s built-in browser.</p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-ink-soft">Connected: <span className="font-mono text-[0.875rem] text-ink">{account.account.address}</span></p>
          <button type="button" onClick={sign} disabled={!right || status.kind === "working"}
            className="self-start btn-start">
            Sign launch terms
          </button>
          <button type="button" onClick={() => { setAccount(null); setStatus({ kind: "idle" }); }} className="self-start text-[0.875rem] text-ink-soft hover:text-ink">Use a different wallet</button>
        </div>
      )}
      {status.text && status.kind !== "idle" ? (
        <p role={status.kind === "error" ? "alert" : "status"} className={status.kind === "error" ? "text-flagged" : "text-ink-soft"}>{status.text}</p>
      ) : null}
      <p className="text-[0.8125rem] text-muted">Signing a message is free and is not a transaction. It can&apos;t move funds or grant any permission.</p>
    </div>
  );
}
