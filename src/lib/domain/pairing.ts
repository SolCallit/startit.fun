export type PairKind = "token" | "project" | "person";
export type PairRelationship = "inspired_by" | "official";

export type Pairing = {
  pair_kind: PairKind | null;
  pair_name: string | null;
  pair_relationship: PairRelationship | null;
  pair_url?: string | null;
  pair_mint?: string | null;
};

export const PAIR_KIND_LABEL: Record<PairKind, string> = { token: "Token", project: "Project", person: "Person" };
export const PAIR_REL_LABEL: Record<PairRelationship, string> = { inspired_by: "Inspired by — not affiliated", official: "Official partner" };

export const hasPairing = (p: Pairing): p is Pairing & { pair_kind: PairKind; pair_name: string; pair_relationship: PairRelationship } =>
  !!p.pair_kind && !!p.pair_name && !!p.pair_relationship;
