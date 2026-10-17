import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui";
import { AuthForm } from "../auth-form";
import { LoginWallet } from "./login-wallet";

export const metadata: Metadata = { title: "Connect wallet" };

export default function Page() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-lg">
        <h1 className="text-[2rem] font-bold tracking-[-0.02em] text-ink">Connect your wallet</h1>
        <p className="mt-2 mb-8 text-ink-soft">
          Your Solana wallet is your Startit account. Use it to launch a coin for a product you back, or just to follow projects.
        </p>
        <Suspense>
          <LoginWallet />
        </Suspense>

        <details className="mt-10 border-t border-line pt-6">
          <summary className="cursor-pointer text-[0.9375rem] font-semibold text-ink-soft hover:text-ink">
            Team or service account? Sign in with email
          </summary>
          <div className="mt-6">
            <Suspense>
              <AuthForm mode="login" />
            </Suspense>
          </div>
        </details>
      </div>
    </Container>
  );
}
