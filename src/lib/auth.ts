import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { walletOf } from "@/lib/wallet-identity";

export type Role = "applicant" | "operator" | "admin" | "screening_service";

export type CurrentUser = {
  id: string;
  email: string | null;
  /** Solana address the user signed in with (null for email accounts). */
  walletAddress: string | null;
  displayName: string;
  roles: Role[];
  isStaff: boolean;
};

/**
 * Data Access Layer entry point. Verifies the session against Supabase Auth (getUser hits the
 * Auth server, so a forged cookie fails here) and loads roles from user_roles under RLS.
 * Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", data.user.id),
  ]);

  const roles = (roleRows ?? []).map((r) => r.role as Role);
  const walletAddress = walletOf(data.user);
  return {
    id: data.user.id,
    email: data.user.email || null,
    walletAddress,
    displayName: profile?.display_name ?? data.user.email ?? (walletAddress ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}` : "Starter"),
    roles,
    isStaff: roles.includes("operator") || roles.includes("admin"),
  };
});

export async function requireUser(next = "/dashboard"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (!user.isStaff) redirect("/dashboard");
  return user;
}
