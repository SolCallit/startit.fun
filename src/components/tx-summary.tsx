const KNOWN: Record<string, string> = {
  DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6: "Raydium LaunchLab (devnet)",
  LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj: "Raydium LaunchLab",
  ComputeBudget111111111111111111111111111111: "Compute budget",
  "11111111111111111111111111111111": "System program",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "SPL Token",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token Account",
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: "Metaplex Token Metadata",
};

export type TxSummaryView = { messageSha256: string; feePayer: string | null; requiredSigners: string[]; programs: string[]; instructionCount: number; usesLookupTables: boolean };

export function TxSummary({ s, labels }: { s: TxSummaryView; labels?: Record<string, string> }) {
  const name = (a: string) => labels?.[a] ?? KNOWN[a];
  return (
    <dl className="grid gap-2 text-[0.875rem]">
      <div className="grid grid-cols-[9rem_1fr] gap-3"><dt className="text-muted">Message hash</dt><dd className="font-mono break-all text-ink">{s.messageSha256}</dd></div>
      <div className="grid grid-cols-[9rem_1fr] gap-3"><dt className="text-muted">Fee payer</dt><dd className="font-mono break-all text-ink">{s.feePayer}</dd></div>
      <div className="grid grid-cols-[9rem_1fr] gap-3"><dt className="text-muted">Must be signed by</dt>
        <dd className="flex flex-col gap-1">{s.requiredSigners.map((k) => <span key={k} className="font-mono break-all text-ink">{k}{name(k) ? <span className="font-sans text-muted"> — {name(k)}</span> : null}</span>)}</dd></div>
      <div className="grid grid-cols-[9rem_1fr] gap-3"><dt className="text-muted">Programs called</dt>
        <dd className="flex flex-col gap-1">{s.programs.map((p) => (
          <span key={p} className={name(p) ? "text-ink" : "text-flagged"}><span className="font-mono break-all">{p}</span> {name(p) ? <span className="text-muted">— {name(p)}</span> : <strong>— unrecognised</strong>}</span>
        ))}</dd></div>
      <div className="grid grid-cols-[9rem_1fr] gap-3"><dt className="text-muted">Instructions</dt><dd className="text-ink">{s.instructionCount}{s.usesLookupTables ? " (uses address lookup tables)" : ""}</dd></div>
    </dl>
  );
}
