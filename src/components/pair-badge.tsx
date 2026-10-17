import { hasPairing, PAIR_KIND_LABEL, PAIR_REL_LABEL, type Pairing } from "@/lib/domain/pairing";

/** "Inspired by X" chip. Always says whether the link is official or just a reference. */
export function PairBadge({ pairing, size = "sm" }: { pairing: Pairing; size?: "sm" | "md" }) {
  if (!hasPairing(pairing)) return null;
  const official = pairing.pair_relationship === "official";
  return (
    <span
      title={`${PAIR_KIND_LABEL[pairing.pair_kind]} · ${PAIR_REL_LABEL[pairing.pair_relationship]}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-paper text-ink-soft ${size === "md" ? "px-3 py-1 text-[0.875rem]" : "px-2.5 py-0.5 text-[0.8125rem]"}`}
    >
      <span className="text-muted">Inspired by</span>
      <span className="truncate font-semibold text-ink">{pairing.pair_name}</span>
      <span className={`rounded-full px-2 text-[0.75rem] font-semibold ${official ? "bg-verified-soft text-verified" : "bg-unverified-soft text-unverified"}`}>
        {official ? "Official" : "Reference"}
      </span>
    </span>
  );
}

/** The on-chain pair: the token a launch trades against. */
export function QuoteChip({ symbol }: { symbol: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cobalt/40 bg-cobalt-soft px-2.5 py-0.5 text-[0.8125rem] text-ink-soft">
      <span className="text-muted">Paired with</span>
      <span className="font-semibold text-ink">{symbol}</span>
    </span>
  );
}
