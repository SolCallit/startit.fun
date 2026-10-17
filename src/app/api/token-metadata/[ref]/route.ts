import { projectImageUrl } from "@/lib/project-image";
import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/env";

/** Metaplex-style token metadata JSON, referenced by the token's on-chain URI. Public data only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/token-metadata/[ref]">) {
  const { ref } = await ctx.params;
  if (!/^STI-\d{4}-\d{6}$/.test(ref) || !isSupabaseConfigured()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data } = await createAnonClient().from("public_projects").select("public_ref, project_name, token_name, ticker, token_concept, status, image_path").eq("public_ref", ref).maybeSingle();
  if (!data || !["ready_for_deployment", "launched"].includes(data.status)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://startit.fun").replace(/\/$/, "");
  return NextResponse.json({
    name: data.token_name,
    symbol: data.ticker,
    description: `${data.token_concept}\n\nCommunity token for ${data.project_name}, launched on Startit with the builder's approval. Verification report: ${site}/projects/${ref}`,
    image: projectImageUrl(data.image_path) ?? `${site}/api/token-image/${ref}`,
    external_url: `${site}/projects/${ref}`,
  }, { headers: { "cache-control": "public, max-age=300" } });
}
