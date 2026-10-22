/**
 * Sign-in-with-Solana message in the standard field order (URI, Version, Issued At).
 * Phantom and others reject messages with fields out of order, so we don't use supabase-js's brand
 * (which writes Version before URI). Used only for wallets without the native `solana:signIn` feature.
 */
export function buildSiwsMessage(p: { domain: string; address: string; statement: string; uri: string; issuedAt: string }) {
  if (/[\r\n]/.test(p.statement)) throw new Error("Statement must be a single line.");
  return [
    `${p.domain} wants you to sign in with your Solana account:`,
    p.address,
    "",
    p.statement,
    "",
    `URI: ${p.uri}`,
    "Version: 1",
    `Issued At: ${p.issuedAt}`,
  ].join("\n");
}
