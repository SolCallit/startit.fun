/**
 * Standalone screening worker for self-hosting (Railway, Fly, a VM).
 *   pnpm worker:screening            # poll every 30s
 *   pnpm worker:screening --once     # process the queue once and exit
 */
import { runScreeningBatch } from "@/lib/screening/pipeline";

const once = process.argv.includes("--once");
const intervalMs = Number(process.env.SCREENING_POLL_MS ?? 30_000);
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopping = true; });

async function main() {
  do {
    try {
      const r = await runScreeningBatch(5);
      if (r.processed || r.failed) console.log(JSON.stringify({ svc: "screening-worker", ...r }));
    } catch (e) {
      console.error(JSON.stringify({ svc: "screening-worker", error: e instanceof Error ? e.message : String(e) }));
      if (once) process.exitCode = 1;
    }
    if (!once && !stopping) await new Promise((r) => setTimeout(r, intervalMs));
  } while (!once && !stopping);
}

void main();
