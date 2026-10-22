import { DB_NETWORK } from "@/lib/network";
import { RPC_URL } from "@/lib/launch/launchlab";
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";

export type MeResponse = {
  wallet: string | null;
  email: string | null;
  displayName: string;
  roles: string[];
  network: "solana-devnet" | "solana-mainnet";
  solBalance: number | null;
  applications: { id: string; name: string | null; ticker: string | null; status: string; updatedAt: string }[];
  activity: { at: string; project: string | null; from: string; to: string }[];
  payouts: { ref: string; recipient: string; sol: number; status: string; tx: string | null; at: string }[];
  launches: { ref: string; name: string | null; ticker: string | null; mint: string | null }[];
};

const LAMPORTS = 1_000_000_000;

/** The signed-in user's own profile panel data. Everything here is read under their RLS or from public views. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = await createClient();
  const network = DB_NETWORK;

  const { data: apps } = await supabase
    .from("applications")
    .select("id, public_ref, project_name, ticker, status, updated_at")
    .eq("applicant_id", user.id)
    .order("updated_at", { ascending: false });
  const appIds = (apps ?? []).map((a) => a.id);
  const nameOf = new Map((apps ?? []).map((a) => [a.id, a.project_name as string | null]));

  const [transitions, payouts, launches, balance] = await Promise.all([
    appIds.length
      ? supabase.from("status_transitions").select("application_id, from_status, to_status, created_at").in("application_id", appIds).order("created_at", { ascending: false }).limit(25)
      : Promise.resolve({ data: [] as { application_id: string; from_status: string; to_status: string; created_at: string }[] }),
    user.walletAddress
      ? createAnonClient().from("public_payouts").select("public_ref, recipient, amount_raw, status, tx_signature, updated_at").eq("recipient_address", user.walletAddress).order("updated_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as { public_ref: string; recipient: string; amount_raw: string; status: string; tx_signature: string | null; updated_at: string }[] }),
    appIds.length
      ? supabase.from("launches").select("application_id, mint_address, status").in("application_id", appIds)
      : Promise.resolve({ data: [] as { application_id: string; mint_address: string | null; status: string }[] }),
    user.walletAddress ? solBalance(user.walletAddress) : Promise.resolve(null),
  ]);

  const body: MeResponse = {
    wallet: user.walletAddress,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    network,
    solBalance: balance,
    applications: (apps ?? []).map((a) => ({ id: a.id, name: a.project_name, ticker: a.ticker, status: a.status, updatedAt: a.updated_at })),
    activity: (transitions.data ?? []).map((t) => ({ at: t.created_at, project: nameOf.get(t.application_id) ?? null, from: t.from_status, to: t.to_status })),
    payouts: (payouts.data ?? []).map((p) => ({ ref: p.public_ref, recipient: p.recipient, sol: Number(BigInt(p.amount_raw)) / LAMPORTS, status: p.status, tx: p.tx_signature, at: p.updated_at })),
    launches: (launches.data ?? [])
      .filter((l) => l.mint_address)
      .map((l) => {
        const a = (apps ?? []).find((x) => x.id === l.application_id);
        return { ref: a?.public_ref ?? "", name: a?.project_name ?? null, ticker: a?.ticker ?? null, mint: l.mint_address };
      }),
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}

async function solBalance(address: string): Promise<number | null> {
  try {
    const conn = new Connection(RPC_URL, "confirmed");
    const lamports = await Promise.race([
      conn.getBalance(new PublicKey(address)),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    return lamports / LAMPORTS;
  } catch {
    return null;
  }
}
