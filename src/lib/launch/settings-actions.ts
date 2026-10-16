"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSolanaAddress } from "./terms";

export type SettingsState = { error?: string; message?: string };

export async function saveFeeRouter(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireStaff();
  if (!user.roles.includes("admin")) return { error: "Only admins can change platform settings." };
  const value = String(formData.get("fee_router_address") ?? "").trim();
  if (!isSolanaAddress(value)) return { error: "Enter a valid Solana address (the Squads vault address)." };
  if (formData.get("confirm") !== "on") return { error: "Confirm you verified this address against Squads." };
  const supabase = await createClient();
  const { error } = await supabase.from("platform_settings").upsert({ key: "fee_router_address", value, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { message: "Saved. Launch terms generated from now on will name this address." };
}
