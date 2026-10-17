"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/domain/status";

export type DecisionState = { error?: string; message?: string };

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/**
 * Every decision goes through transition_application(), which re-checks the caller's role and the
 * allowed transition in the database. This action only adds the human confirmation requirements.
 */
export async function decide(appId: string, _prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const staff = await requireStaff();
  const to = String(formData.get("to") ?? "") as ApplicationStatus;
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  if (!isUuid(appId) || !APPLICATION_STATUSES.includes(to)) return { error: "Unknown action." };

  if (to === "approved") {
    if (formData.get("confirm_identity") !== "on" || formData.get("confirm_authorization") !== "on") {
      return { error: "Confirm you verified who the builder is and that they approved this launch." };
    }
    if (!reason) return { error: "Record how you verified the builder before approving." };
  }
  if (["rejected", "suspended", "evidence_requested"].includes(to) && !reason) {
    return { error: "Add a reason. It's stored in the decision history." };
  }

  const supabase = await createClient();
  if (to === "evidence_requested") {
    const { error } = await supabase.from("evidence_requests").insert({ application_id: appId, requested_by: staff.id, message: reason });
    if (error) return { error: `Couldn't record the request: ${error.message}` };
  }
  const { error } = await supabase.rpc("transition_application", { p_app: appId, p_to: to, p_reason: reason || null });
  if (error) return { error: error.message };

  revalidatePath(`/admin/applications/${appId}`);
  revalidatePath("/admin");
  return { message: "Decision recorded." };
}

export async function addNote(appId: string, formData: FormData) {
  const staff = await requireStaff();
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!isUuid(appId) || !body) return;
  const supabase = await createClient();
  await supabase.from("operator_notes").insert({ application_id: appId, author_id: staff.id, body });
  revalidatePath(`/admin/applications/${appId}`);
}
