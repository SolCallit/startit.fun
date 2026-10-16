import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-[2rem] font-bold tracking-[-0.02em] text-ink">Sign in</h1>
        <p className="mt-2 mb-8 text-ink-soft">Pick up your application where you left off.</p>
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </Container>
  );
}
