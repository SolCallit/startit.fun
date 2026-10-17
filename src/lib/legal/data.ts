import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "./terms-of-use";

export async function hasAcceptedTerms(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("terms_acceptances").select("id").eq("user_id", userId).eq("version", TERMS_VERSION).maybeSingle();
  return !!data;
}
