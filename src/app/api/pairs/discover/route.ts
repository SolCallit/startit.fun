import { connection, NextResponse } from "next/server";
import { discoverLaunchLabConfigs } from "@/lib/launch/pair-catalog";
import { LAUNCHLAB_PROGRAM } from "@/lib/launch/launchlab";

/** Public, cached: every quote-token config the LaunchLab program has on this network. On-chain data only. */
export async function GET(req: Request) {
  await connection();
  const network = new URL(req.url).searchParams.get("network") === "mainnet" ? "mainnet" : "devnet";
  try {
    const configs = await discoverLaunchLabConfigs(network);
    return NextResponse.json({ network, program: network === "devnet" ? LAUNCHLAB_PROGRAM.toBase58() : "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj", count: configs.length, configs },
      { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
