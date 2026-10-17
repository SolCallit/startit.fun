"use client";

import { useSearchParams } from "next/navigation";
import { WalletLogin } from "@/components/wallet-login";

export function LoginWallet() {
  const raw = useSearchParams().get("next") ?? "/dashboard";
  // Only same-site paths: never redirect to another origin after sign-in.
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  return <WalletLogin next={next} />;
}
