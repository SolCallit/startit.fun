import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, Notice, PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FeeRouterForm } from "./settings-form";
import { PlatformSetup } from "./platform-setup";
import { PayoutSettingsForm } from "./payout-settings-form";

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
  return (
    <div className="max-w-2xl">
      {!user.roles.includes("admin") ? <div className="mb-6"><Notice tone="warn">Only admins can change these. You can view them.</Notice></div> : null}
      <Panel title="Fee Router">
        <FeeRouterForm current={data?.value ?? null} />
        {data ? <p className="mt-4 text-[0.8125rem] text-muted">Last changed {new Date(data.updated_at).toLocaleString()}.</p> : null}
      </Panel>
      <div className="mt-6">
        <Panel title="Payouts">
          {user.roles.includes("admin") ? (
            <PayoutSettingsForm multisig={get("fee_router_multisig")?.value ?? null} platform={get("platform_treasury_address")?.value ?? null} />
          ) : <p className="text-ink-soft">Multisig {get("fee_router_multisig")?.value ?? "not set"}; platform wallet {get("platform_treasury_address")?.value ?? "not set"}.</p>}
        </Panel>
      </div>
      <div className="mt-6">
        <Panel title="Raydium LaunchLab platform (devnet)">
          {!data ? <p className="text-ink-soft">Set the Fee Router first.</p> : !user.roles.includes("admin") ? (
            <p className="text-ink-soft">{get("launchlab_platform_id") ? `Platform ${get("launchlab_platform_id")!.value}` : "Not set up yet. An admin must do this."}</p>
          ) : (
            <PlatformSetup platformId={get("launchlab_platform_id")?.value ?? null} redirected={!!get("launchlab_cp_creator_redirected")} />
          )}
        </Panel>
      </div>
    </div>
  );
}
