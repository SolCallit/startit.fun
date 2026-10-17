"use client";

import { useSearchParams } from "next/navigation";
import { WalletLogin } from "@/components/wallet-login";

export function LoginWallet() {
  const raw = useSearchParams().get("next") ?? "/home";
  // Only same-site paths: never redirect to another origin after sign-in.
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/home";
  return <WalletLogin next={next} />;
}
