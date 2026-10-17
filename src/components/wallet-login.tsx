"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import {
  SolanaSignIn,
  SolanaSignMessage,
  type SolanaSignInFeature,
  type SolanaSignMessageFeature,
} from "@solana/wallet-standard-features";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { buildSiwsMessage } from "@/lib/siws";

type LoginWallet = Wallet & { features: StandardConnectFeature & Partial<SolanaSignInFeature & SolanaSignMessageFeature> };

const isSolana = (w: Wallet) => w.chains.some((c) => c.startsWith("solana:"));
const canLogin = (w: Wallet): w is LoginWallet =>
  isSolana(w) && StandardConnect in w.features && (SolanaSignIn in w.features || SolanaSignMessage in w.features);

/** Shown in the wallet's sign-in prompt. Single line (Sign in with Solana requirement). */
const STATEMENT = "Sign in to Startit.fun. This only proves you own this wallet. No transaction, no fee.";

const INSTALL = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://www.solflare.com/download/" },
  { name: "Backpack", url: "https://backpack.app/download" },
];

function useLoginWallets() {
  const [wallets, setWallets] = useState<LoginWallet[]>([]);
  useEffect(() => {
    const api = getWallets();
    const refresh = () => setWallets(api.get().filter(canLogin));
    refresh();
    const a = api.on("register", refresh), b = api.on("unregister", refresh);
    return () => { a(); b(); };
  }, []);
  return wallets;
}

/**
 * Signs a Sign-in-with-Solana message and exchanges it for a Supabase session.
 * Prefers the wallet's own `solana:signIn` (the wallet writes and shows the message itself);
 * otherwise connects and signs a standard-format message we build.
 */
async function signInWith(w: LoginWallet) {
  const supabase = createBrowserSupabase();
  const { host, href } = window.location;
  const issuedAt = new Date().toISOString();
  let message: string;
  let signature: Uint8Array;

  const signIn = w.features[SolanaSignIn];
  if (signIn) {
    const [out] = await signIn.signIn({ domain: host, uri: href, version: "1", statement: STATEMENT, issuedAt });
    if (!out) throw new Error("The wallet returned no signature.");
    message = new TextDecoder().decode(out.signedMessage);
    signature = out.signature;
  } else {
    const signMessage = w.features[SolanaSignMessage];
    if (!signMessage) throw new Error("This wallet can't sign messages.");
    const { accounts } = await w.features[StandardConnect].connect();
    const account = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
    if (!account) throw new Error("The wallet didn't share an account.");
    message = buildSiwsMessage({ domain: host, address: account.address, statement: STATEMENT, uri: href, issuedAt });
    const [out] = await signMessage.signMessage({ account, message: new TextEncoder().encode(message) });
    if (!out) throw new Error("The wallet returned no signature.");
    signature = out.signature;
  }

  const { error } = await supabase.auth.signInWithWeb3({ chain: "solana", message, signature });
  if (error) throw new Error(friendly(error.message));
}

function friendly(msg: string) {
  if (/web3.*(disabled|not enabled)|provider.*disabled/i.test(msg)) return "Wallet sign-in isn't switched on for this site yet.";
  if (/rejected|declined|cancel/i.test(msg)) return "You cancelled the signature in your wallet.";
  if (/uri|domain/i.test(msg)) return "This site's address isn't on the allowed list yet. Ask the operator to add it.";
  return msg;
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Wallet picker. `variant="header"` renders a button that opens a dialog; `"panel"` renders the list inline. */
export function WalletLogin({ next, variant = "panel" }: { next?: string; variant?: "panel" | "header" }) {
  const pathname = usePathname();
  const target = next ?? (variant === "header" && pathname !== "/" && pathname !== "/login" ? pathname : "/home");
  const wallets = useLoginWallets();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  async function pick(w: LoginWallet) {
    setError(null);
    setBusy(w.name);
    try {
      await signInWith(w);
      dialog.current?.close();
      router.replace(target);
      router.refresh();
    } catch (e) {
      setError(friendly(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  const list = (
    <div className="flex flex-col gap-3">
      {wallets.length > 0 ? (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {wallets.map((w) => (
            <li key={w.name}>
              <button
                type="button"
                onClick={() => pick(w)}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3 text-left font-semibold text-ink hover:border-cobalt disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs from the extension */}
                <img src={w.icon} alt="" width={28} height={28} className="rounded-md" />
                <span className="flex-1">{w.name}</span>
                {busy === w.name ? <span className="text-[0.8125rem] font-medium text-muted">Check wallet…</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-ink-soft">
          <p className="font-semibold text-ink">No Solana wallet found in this browser</p>
          <p className="mt-1 text-[0.9375rem]">Install one, then reload this page:</p>
          <p className="mt-2 flex flex-wrap gap-4 text-[0.9375rem] font-semibold">
            {INSTALL.map((i) => (
              <a key={i.name} href={i.url} target="_blank" rel="noreferrer" className="text-cobalt hover:underline">{i.name}</a>
            ))}
          </p>
        </div>
      )}
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        You&apos;ll sign a message to prove you own the wallet. It costs nothing and can&apos;t move funds.
      </p>
      {error ? <p role="alert" className="text-[0.9375rem] text-flagged">{error}</p> : null}
    </div>
  );

  if (variant === "panel") return list;

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); dialog.current?.showModal(); }}
        className="rounded-full bg-ink shadow-raise-sm active:translate-y-[2px] active:shadow-none px-3.5 py-2 text-[0.875rem] font-semibold text-paper hover:opacity-90"
      >
        Connect wallet
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-paper p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="text-[1.25rem] font-bold">Connect wallet</h2>
            <p className="mt-1 text-[0.9375rem] text-ink-soft">Sign in with a Solana wallet.</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="text-[1.5rem] leading-none text-muted hover:text-ink">×</button>
        </div>
        <div className="px-6 py-5">{list}</div>
      </dialog>
    </>
  );
}
