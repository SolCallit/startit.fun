export const FINDING_STATUSES = ["VERIFIED", "UNVERIFIED", "NEEDS_REVIEW", "FLAGGED"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const FINDING_LABEL: Record<FindingStatus, string> = {
  VERIFIED: "Verified",
  UNVERIFIED: "Unverified",
  NEEDS_REVIEW: "Needs review",
  FLAGGED: "Flagged",
};
