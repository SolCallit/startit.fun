"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signUp, type AuthState } from "./actions";

const input =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-ink placeholder:text-muted focus:border-cobalt focus:outline-none";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      {mode === "signup" ? (
        <label className="flex flex-col gap-1.5 text-[0.9375rem] font-medium text-ink">
          Your name
          <input name="displayName" autoComplete="name" required className={input} />
        </label>
      ) : null}
      <label className="flex flex-col gap-1.5 text-[0.9375rem] font-medium text-ink">
        Email
        <input name="email" type="email" autoComplete="email" required className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-[0.9375rem] font-medium text-ink">
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={10}
          required
          className={input}
        />
      </label>

      {state.error ? <p role="alert" className="text-[0.9375rem] text-flagged">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-[0.9375rem] text-verified">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-cobalt px-4 py-2.5 font-semibold text-cobalt-ink hover:opacity-90 disabled:opacity-50"
      >
        {pending ? (mode === "login" ? "Signing in…" : "Creating account…") : mode === "login" ? "Sign in" : "Create account"}
      </button>

      <p className="text-[0.9375rem] text-ink-soft">
        {mode === "login" ? (
          <>Founders: connect a wallet above to create an account.</>
        ) : (
          <>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-cobalt">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
