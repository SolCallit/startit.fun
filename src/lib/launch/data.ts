import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getLaunchConfigBundle(appId: string) {
  const supabase = await createClient();
  const [{ data: launch }, { data: treasury }, { data: router }, { data: agreements }, { data: requests }, blockers] = await Promise.all([
    supabase.from("launches").select("*").eq("application_id", appId).maybeSingle(),
    supabase.from("treasuries").select("*").eq("application_id", appId).maybeSingle(),
    supabase.from("platform_settings").select("value").eq("key", "fee_router_address").maybeSingle(),
    supabase.from("agreements").select("id, signer_role, signer_wallet, document_sha256, signed_at").eq("application_id", appId).not("signer_role", "is", null).order("signed_at", { ascending: false }),
    supabase.from("signing_requests").select("id, role, created_at, expires_at, used_at, revoked_at, terms_sha256").eq("application_id", appId).order("created_at", { ascending: false }),
    supabase.rpc("launch_blockers", { p_app: appId }),
  ]);
  const { data: feeConfig } = launch?.fee_config_id
    ? await supabase.from("fee_configs").select("*").eq("id", launch.fee_config_id).single()
    : { data: null };
  return {
    launch, treasury, feeConfig,
    feeRouter: (router?.value as string | undefined) ?? null,
    agreements: (agreements ?? []) as { id: string; signer_role: "founder" | "launcher"; signer_wallet: string; document_sha256: string; signed_at: string }[],
    requests: (requests ?? []) as { id: string; role: string; created_at: string; expires_at: string; used_at: string | null; revoked_at: string | null; terms_sha256: string }[],
    blockers: (blockers.data ?? []) as string[],
  };
}
