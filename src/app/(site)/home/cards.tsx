import { projectImageUrl } from "@/lib/project-image";
import { Lift } from "@/components/motion";
import Link from "next/link";
import type { PublicProject } from "@/lib/data/public";
import { PairBadge, QuoteChip } from "@/components/pair-badge";
import { StatusBadge } from "@/components/ui";

export function ProjectCard({ p }: { p: PublicProject }) {
  return (
    <li>
      <Lift className="h-full">
      <Link
        href={`/projects/${p.public_ref}`}
        className="flex h-full flex-col gap-4 rounded-[18px] glass p-5 shadow-raise-sm hover:border-line-strong"
      >
        <div className="flex items-start gap-3">
          <TokenMark ticker={p.ticker} image={projectImageUrl(p.image_path)} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[1.125rem] font-extrabold text-ink">{p.project_name}</p>
            <p className="font-mono text-[0.875rem] text-muted">${p.ticker}</p>
          </div>
        </div>
        <p className="line-clamp-2 text-[0.9375rem] leading-snug text-ink-soft">{p.project_summary}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <StatusBadge status={p.status} />
          <QuoteChip symbol={p.quote_symbol ?? "SOL"} />
          <PairBadge pairing={p} />
          {p.network === "solana-devnet" ? <span className="rounded-full bg-review-soft px-2.5 py-0.5 text-[0.8125rem] font-semibold text-review">Devnet</span> : null}
        </div>
      </Link>
      </Lift>
    </li>
  );
}


/** Monogram avatar with a stable hue per ticker — no network request, never a broken image. */
export function TokenMark({ ticker, size = 48, image }: { ticker: string; size?: number; image?: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-[14px] object-cover shadow-raise-sm" />;
  }
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: `linear-gradient(145deg, hsl(${h} 70% 58%), hsl(${(h + 40) % 360} 65% 38%))` }}
      className="grid shrink-0 place-items-center rounded-[14px] font-display text-[1.0625rem] font-extrabold text-white shadow-raise-sm"
    >
      {ticker.slice(0, 2)}
    </span>
  );
}
