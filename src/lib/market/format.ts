/** Compact number format with subscript zeros for tiny prices (0.0₅1234). Safe on server and client. */
export function fmt(n: number) {
  if (!Number.isFinite(n)) return "–";
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (a >= 1) return n.toFixed(3);
  if (a >= 0.001) return n.toFixed(6);
  const s = n.toFixed(20).replace(/0+$/, "");
  const zeros = s.split(".")[1]?.match(/^0*/)?.[0].length ?? 0;
  return `0.0${subscript(zeros)}${s.split(".")[1]!.slice(zeros, zeros + 4)}`;
}
const subscript = (n: number) => String(n).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).join("");
