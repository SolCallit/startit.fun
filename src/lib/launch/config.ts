import { z } from "zod";
import { isDefaultSplit, validateSplit } from "@/lib/domain/fees";
import { isSolanaAddress } from "./terms";

export const DEFAULT_SUPPLY = "1000000000"; // 1B, pump.fun-style
export const DEFAULT_DECIMALS = 6;
export const SIGNING_LINK_TTL_DAYS = 7;

const address = (label: string) => z.string().trim().refine(isSolanaAddress, `${label} must be a valid Solana address.`);
const optionalAddress = (label: string) => z.union([z.literal(""), address(label)]);

/** Operator's launch configuration form. */
export const launchConfigSchema = z
  .object({
    platform_bps: z.coerce.number().int(),
    founder_bps: z.coerce.number().int(),
    launcher_bps: z.coerce.number().int(),
    community_bps: z.coerce.number().int(),
    deviation_reason: z.string().trim().max(1000),
    founder_wallet: address("Founder wallet"),
    launcher_wallet: optionalAddress("Launcher wallet"),
    treasury_address: address("Treasury address"),
    treasury_is_multisig: z.enum(["yes", "no"]),
    treasury_threshold: z.string().trim(),
    treasury_signers: z.string().trim().max(2000),
    treasury_rules: z.string().trim().min(10, "Describe how treasury funds can be spent.").max(2000),
    insider_allocations: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    const split = { platformBps: v.platform_bps, founderBps: v.founder_bps, launcherBps: v.launcher_bps, communityBps: v.community_bps };
    const r = validateSplit(split);
    if (!r.ok) ctx.addIssue({ code: "custom", path: ["community_bps"], message: r.error });
    if (!isDefaultSplit(split) && !v.deviation_reason) ctx.addIssue({ code: "custom", path: ["deviation_reason"], message: "A non-default split needs a published reason." });
    if (v.launcher_bps > 0 && !v.launcher_wallet) ctx.addIssue({ code: "custom", path: ["launcher_wallet"], message: "Set the launcher's payout wallet." });
    if (v.launcher_bps === 0 && v.launcher_wallet) ctx.addIssue({ code: "custom", path: ["launcher_wallet"], message: "Remove the launcher wallet or give the launcher a share." });
    if (v.treasury_is_multisig === "yes") {
      const signers = parseSigners(v.treasury_signers);
      const t = Number(v.treasury_threshold);
      if (signers.some((s) => !isSolanaAddress(s))) ctx.addIssue({ code: "custom", path: ["treasury_signers"], message: "Every signer must be a valid Solana address, one per line." });
      if (new Set(signers).size !== signers.length) ctx.addIssue({ code: "custom", path: ["treasury_signers"], message: "Signers must be distinct." });
      if (signers.length < 2) ctx.addIssue({ code: "custom", path: ["treasury_signers"], message: "A multisig needs at least 2 signers." });
      if (!Number.isInteger(t) || t < 2 || t > signers.length) ctx.addIssue({ code: "custom", path: ["treasury_threshold"], message: "Threshold must be at least 2 and no more than the number of signers." });
    }
    const allocations = parseAllocations(v.insider_allocations);
    if (allocations === null) ctx.addIssue({ code: "custom", path: ["insider_allocations"], message: "Use one line per holder: name | whole tokens | note." });
  });

export const parseSigners = (s: string) => s.split(/\s+/).map((x) => x.trim()).filter(Boolean);

/** "Team vesting | 10000000 | 12-month lock" per line. Empty → none. null → malformed. */
export function parseAllocations(s: string): { holder: string; amount: string; note: string }[] | null {
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: { holder: string; amount: string; note: string }[] = [];
  for (const line of lines) {
    const [holder, amount, note] = line.split("|").map((x) => x?.trim() ?? "");
    if (!holder || !/^\d{1,18}$/.test(amount ?? "") || !note) return null;
    out.push({ holder, amount: amount!, note });
  }
  return out;
}

export const wholeToRaw = (whole: string, decimals: number) => (BigInt(whole) * BigInt(10) ** BigInt(decimals)).toString();
