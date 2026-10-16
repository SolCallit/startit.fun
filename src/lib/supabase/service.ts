import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseServiceEnv } from "@/lib/env";

/**
 * Service-role client: bypasses RLS. Use ONLY for narrowly-scoped server actions that verify
 * their own authorization first (e.g. one-time signing links for founders who have no account).
 */
export function createServiceClient() {
  const env = supabaseServiceEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
