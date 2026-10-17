"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "./terms-of-use";

/** Records that the signed-in user accepted the current Terms of Use. */
export async function acceptTerms(): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  const supabase = await createClient();
  const ua = ((await headers()).get("user-agent") ?? "").slice(0, 512) || null;
  const { error } = await supabase.from("terms_acceptances").insert({
    user_id: user.id, version: TERMS_VERSION, wallet: user.walletAddress, user_agent: ua,
  });
  if (error && error.code !== "23505") return { error: `Couldn't record that: ${error.message}` };
  revalidatePath("/", "layout");
  return {};
}

/** Declining signs you out. The Services can't be used without accepting. */
export async function declineTerms() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?declined=1");
}
