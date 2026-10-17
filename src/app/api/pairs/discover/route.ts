import { connection, NextResponse } from "next/server";
import { discoverLaunchLabConfigs } from "@/lib/launch/pair-catalog";
import { LAUNCHLAB_PROGRAM } from "@/lib/launch/launchlab";

/** Public, cached: every quote-token config the LaunchLab program has on this network. On-chain data only. */
export async function GET() {
  await connection();
  try {
    const configs = await discoverLaunchLabConfigs();
    return NextResponse.json({ program: LAUNCHLAB_PROGRAM.toBase58(), count: configs.length, configs },
      { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
