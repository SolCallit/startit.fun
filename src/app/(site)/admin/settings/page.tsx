import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, Notice, PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FeeRouterForm } from "./settings-form";
import { PlatformSetup } from "./platform-setup";
import { PayoutSettingsForm } from "./payout-settings-form";
import { QuoteTokens, type QuoteRow } from "./quote-tokens";

export const metadata: Metadata = { title: "Platform settings" };

export default function Settings() {
  return (
    <Container className="py-12">
      <PageHeader title="Platform settings" lede="Addresses every launch depends on. Changes are recorded in the audit log." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Body /></Suspense>
    </Container>
  );
}

async function Body() {
  const user = await requireStaff();
  const supabase = await createClient();
  const { data: rows } = await supabase.from("platform_settings").select("key, value, updated_at");
  const get = (k: string) => rows?.find((r) => r.key === k);
  const data = get("fee_router_address");
  const { data: quotes } = await supabase.from("quote_tokens")
    .select("mint, symbol, name, decimals, launchlab_config_id, platform_allowed_at, enabled, listed, category, logo_url").order("created_at").limit(3000);
  return (
    <div className="max-w-2xl">
      {!user.roles.includes("admin") ? <div className="mb-6"><Notice tone="warn">Only admins can change these. You can view them.</Notice></div> : null}
      <Panel title="Fee Router">
        <FeeRouterForm current={data?.value ?? null} />
        {data ? <p className="mt-4 text-[0.8125rem] text-muted">Last changed {new Date(data.updated_at).toLocaleString()}.</p> : null}
      </Panel>
      <div className="mt-6">
        <Panel title="Raydium LaunchLab platform (devnet)">
          {!data ? <p className="text-ink-soft">Set the Fee Router first.</p> : !user.roles.includes("admin") ? (
            <p className="text-ink-soft">{get("launchlab_platform_id") ? `Platform ${get("launchlab_platform_id")!.value}` : "Not set up yet. An admin must do this."}</p>
          ) : (
            <PlatformSetup platformId={get("launchlab_platform_id")?.value ?? null} redirected={!!get("launchlab_cp_creator_redirected")} />
          )}
        </Panel>
      </div>
      <div className="mt-6">
        <Panel title="Payouts (not needed to launch)">
          <p className="mb-4 text-[0.9375rem] text-ink-soft">
            Only needed once a coin has collected fees and you want to pay them out. Payouts are signed from a Squads multisig
            (a shared wallet that needs several approvals). Create one at squads.so, set the Fee Router above to the
            multisig&apos;s vault address, then paste the multisig account here. For a test launch, leave this empty.
          </p>
          {user.roles.includes("admin") ? (
            <PayoutSettingsForm multisig={get("fee_router_multisig")?.value ?? null} platform={get("platform_treasury_address")?.value ?? null} />
          ) : <p className="text-ink-soft">Multisig {get("fee_router_multisig")?.value ?? "not set"}; platform wallet {get("platform_treasury_address")?.value ?? "not set"}.</p>}
        </Panel>
      </div>
      <div className="mt-6">
        <Panel title="Pairs (quote tokens)">
          {user.roles.includes("admin") ? (
            <QuoteTokens rows={(quotes ?? []) as QuoteRow[]} platformReady={!!get("launchlab_platform_id")} />
          ) : (
            <p className="text-ink-soft">{(quotes ?? []).filter((q) => q.enabled).map((q) => q.symbol).join(", ") || "SOL"}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
