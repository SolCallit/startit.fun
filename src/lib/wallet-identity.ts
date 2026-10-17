type AuthUserLike = { user_metadata?: Record<string, unknown>; identities?: { provider: string; identity_data?: Record<string, unknown> }[] };

/** Supabase "Sign in with Web3" stores the address as identity data and as `web3:solana:<address>` in `sub`. */
export function walletOf(user: AuthUserLike): string | null {
  const isAddr = (v: unknown): v is string => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
  for (const id of user.identities ?? []) {
    const d = id.identity_data ?? {};
    if (id.provider === "web3" && (d.chain === undefined || d.chain === "solana")) {
      if (isAddr(d.address)) return d.address;
      const sub = typeof d.sub === "string" ? d.sub.match(/^web3:solana:(.+)$/)?.[1] : undefined;
      if (isAddr(sub)) return sub;
    }
  }
  const m = user.user_metadata ?? {};
  const claims = (m.custom_claims ?? {}) as Record<string, unknown>;
  if (isAddr(claims.address)) return claims.address;
  const sub = typeof m.sub === "string" ? m.sub.match(/^web3:solana:(.+)$/)?.[1] : undefined;
  return isAddr(sub) ? sub : null;
}
