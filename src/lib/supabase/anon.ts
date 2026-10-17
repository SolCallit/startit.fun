import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";

/** Cookie-less anonymous client for public read models (public_* views). */
export function createAnonClient() {
  const env = supabasePublicEnv();
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
