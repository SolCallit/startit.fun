import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create a founder account" };

export default function Page() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-[2rem] font-bold tracking-[-0.02em] text-ink">Create a founder account</h1>
        <p className="mt-2 mb-8 text-ink-soft">You&apos;ll use this account to submit and track your launch application.</p>
        <Suspense>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </Container>
  );
}
