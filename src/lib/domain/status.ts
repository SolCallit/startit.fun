/** Mirrors the Postgres enum `application_status`. The database is the authority on transitions. */
export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "ai_screening",
  "evidence_requested",
  "awaiting_review",
  "approved",
  "launch_config_pending",
  "ready_for_deployment",
  "launched",
  "rejected",
  "suspended",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  ai_screening: "AI screening in progress",
  evidence_requested: "Additional evidence requested",
  awaiting_review: "Awaiting human review",
  approved: "Approved for launch",
  launch_config_pending: "Launch configuration pending",
  ready_for_deployment: "Ready for deployment",
  launched: "Launched",
  rejected: "Rejected",
  suspended: "Suspended",
};

/** The happy path, used to draw the applicant's timeline. */
export const TIMELINE: ApplicationStatus[] = [
  "draft",
  "submitted",
  "ai_screening",
  "awaiting_review",
  "approved",
  "launch_config_pending",
  "ready_for_deployment",
  "launched",
];

export type StatusTone = "neutral" | "progress" | "attention" | "good" | "bad";

export const STATUS_TONE: Record<ApplicationStatus, StatusTone> = {
  draft: "neutral",
  submitted: "progress",
  ai_screening: "progress",
  evidence_requested: "attention",
  awaiting_review: "progress",
  approved: "good",
  launch_config_pending: "good",
  ready_for_deployment: "good",
  launched: "good",
  rejected: "bad",
  suspended: "bad",
};

/** Operator-facing actions per state. Server actions still go through transition_application(). */
export const OPERATOR_ACTIONS: Partial<
  Record<ApplicationStatus, { to: ApplicationStatus; label: string; needsReason: boolean; intent: "primary" | "neutral" | "danger" }[]>
> = {
  awaiting_review: [
    { to: "approved", label: "Approve for launch", needsReason: true, intent: "primary" },
    { to: "evidence_requested", label: "Request more evidence", needsReason: true, intent: "neutral" },
    { to: "ai_screening", label: "Re-run AI screening", needsReason: false, intent: "neutral" },
    { to: "rejected", label: "Reject", needsReason: true, intent: "danger" },
  ],
  approved: [{ to: "launch_config_pending", label: "Start launch configuration", needsReason: false, intent: "primary" }],
};

export const SUSPENDABLE: ApplicationStatus[] = APPLICATION_STATUSES.filter(
  (s) => !["draft", "rejected", "suspended"].includes(s),
);
