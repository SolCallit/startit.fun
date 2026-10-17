import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/env";

/** Placeholder token image: the ticker on Startit cobalt. Replaced when founders upload approved artwork. */
export async function GET(_req: Request, ctx: RouteContext<"/api/token-image/[ref]">) {
  const { ref } = await ctx.params;
  if (!/^STI-\d{4}-\d{6}$/.test(ref) || !isSupabaseConfigured()) return new Response("not found", { status: 404 });
  const { data } = await createAnonClient().from("public_projects").select("ticker").eq("public_ref", ref).maybeSingle();
  if (!data) return new Response("not found", { status: 404 });
  const t = String(data.ticker).replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const size = t.length <= 4 ? 112 : t.length <= 6 ? 84 : 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#2346d6"/><text x="256" y="256" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${size}" text-anchor="middle" dominant-baseline="central">$${t}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" } });
}
