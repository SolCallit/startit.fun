"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  if (to === "approved" && formData.get("confirm_builder") !== "on") {
    return { error: "Switch on the check that the builder approved this launch." };
  }
  if (to === "awaiting_review" && !staff.roles.includes("admin")) return { error: "Only admins can skip AI screening." };
  if (["rejected", "suspended", "evidence_requested"].includes(to) && !reason) {
    return { error: "Add a reason. It's stored in the decision history." };
  }

  const supabase = await createClient();
  // A double tap lands here after the first one already moved it: treat that as done.
  const { data: current } = await supabase.from("applications").select("status").eq("id", appId).maybeSingle();
  if (current?.status === to) redirect(to === "launch_config_pending" ? `/admin/applications/${appId}/launch` : `/admin/applications/${appId}`);
  const defaultReason = to === "awaiting_review" ? "AI screening not switched on yet; reviewed manually." : to === "approved" ? "Builder approval checked against the uploaded proof." : "";
  if (to === "evidence_requested") {
    const { error } = await supabase.from("evidence_requests").insert({ application_id: appId, requested_by: staff.id, message: reason });
    if (error) return { error: `Couldn't record the request: ${error.message}` };
  }
  const { error } = await supabase.rpc("transition_application", { p_app: appId, p_to: to, p_reason: reason || defaultReason || null });
  if (error) return { error: error.message };

  revalidatePath(`/admin/applications/${appId}`);
  revalidatePath("/admin");
  redirect(to === "launch_config_pending" ? `/admin/applications/${appId}/launch` : `/admin/applications/${appId}`);
}

export async function addNote(appId: string, formData: FormData) {
  const staff = await requireStaff();
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!isUuid(appId) || !body) return;
  const supabase = await createClient();
  await supabase.from("operator_notes").insert({ application_id: appId, author_id: staff.id, body });
  revalidatePath(`/admin/applications/${appId}`);
}
