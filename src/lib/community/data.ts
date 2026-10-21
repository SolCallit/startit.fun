import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export type CommentView = {
  id: string; parent_id: string | null; author: string; wallet: string | null; body: string;
  created_at: string; edited_at: string | null; likes: number; liked: boolean; mine: boolean;
};

/** Every comment on a coin with like counts, oldest replies first under each parent. */
export async function listComments(ref: string): Promise<CommentView[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data: rows } = await supabase.from("token_comments")
    .select("id, parent_id, author_name, author_wallet, body, created_at, edited_at, user_id")
    .eq("public_ref", ref).order("created_at", { ascending: false }).limit(500);
  const ids = (rows ?? []).map((r) => r.id as string);
  const { data: likes } = ids.length ? await supabase.from("token_comment_likes").select("comment_id, user_id").in("comment_id", ids) : { data: [] };
  const count = new Map<string, number>(), mineLiked = new Set<string>();
  for (const l of likes ?? []) {
    count.set(l.comment_id as string, (count.get(l.comment_id as string) ?? 0) + 1);
    if (user && l.user_id === user.id) mineLiked.add(l.comment_id as string);
  }
  return (rows ?? []).map((r) => ({
    id: r.id as string, parent_id: (r.parent_id as string | null) ?? null,
    author: (r.author_name as string) || shortWallet(r.author_wallet as string | null), wallet: (r.author_wallet as string | null) ?? null,
    body: r.body as string, created_at: r.created_at as string, edited_at: (r.edited_at as string | null) ?? null,
    likes: count.get(r.id as string) ?? 0, liked: mineLiked.has(r.id as string), mine: !!user && r.user_id === user.id,
  }));
}

const shortWallet = (w: string | null) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : "anon");

/** Counts this visit once per visitor per day. The visitor is a salted hash of IP + browser; nothing raw is stored. */
export async function recordView(ref: string): Promise<number> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ua = h.get("user-agent") ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.VIEW_SALT || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "startit";
  const visitor = createHash("sha256").update(`${salt}|${ref}|${day}|${ip}|${ua}`).digest("hex");
  const supabase = await createClient();
  const { data } = await supabase.rpc("record_token_view", { p_ref: ref, p_visitor: visitor });
  return Number(data ?? 0);
}
