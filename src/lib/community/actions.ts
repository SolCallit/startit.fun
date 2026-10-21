"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
const okRef = (ref: string) => /^STI-\d{4}-\d{6}$/.test(ref);

export async function postComment(ref: string, body: string, parentId: string | null): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Connect your wallet to comment." };
  const text = body.trim();
  if (!okRef(ref)) return { ok: false, error: "Unknown coin." };
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > 1000) return { ok: false, error: "Keep it under 1,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("token_comments").insert({ public_ref: ref, user_id: user.id, parent_id: parentId, body: text });
  if (error) return { ok: false, error: error.code === "54000" ? "Slow down a little: too many comments in a minute." : error.message };
  revalidatePath(`/projects/${ref}`);
  return { ok: true };
}

export async function toggleLike(ref: string, commentId: string, like: boolean): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Connect your wallet to like." };
  const supabase = await createClient();
  const { error } = like
    ? await supabase.from("token_comment_likes").insert({ comment_id: commentId, user_id: user.id })
    : await supabase.from("token_comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
  if (error && error.code !== "23505") return { ok: false, error: error.message };
  revalidatePath(`/projects/${ref}`);
  return { ok: true };
}

export async function deleteComment(ref: string, commentId: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Connect your wallet first." };
  const supabase = await createClient();
  const { error } = await supabase.from("token_comments").delete().eq("id", commentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${ref}`);
  return { ok: true };
}
