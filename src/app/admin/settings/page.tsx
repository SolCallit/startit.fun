import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, Notice, PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FeeRouterForm } from "./settings-form";

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
  const { data } = await supabase.from("platform_settings").select("value, updated_at").eq("key", "fee_router_address").maybeSingle();
  return (
    <div className="max-w-2xl">
      {!user.roles.includes("admin") ? <div className="mb-6"><Notice tone="warn">Only admins can change these. You can view them.</Notice></div> : null}
      <Panel title="Fee Router">
        <FeeRouterForm current={data?.value ?? null} />
        {data ? <p className="mt-4 text-[0.8125rem] text-muted">Last changed {new Date(data.updated_at).toLocaleString()}.</p> : null}
      </Panel>
    </div>
  );
}
