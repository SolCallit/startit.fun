import "server-only";
import { after } from "next/server";
import { screeningEnv } from "@/lib/env";
import { runScreeningBatch } from "./pipeline";

export function isScreeningConfigured(): boolean {
  try {
    const env = screeningEnv();
    return Boolean(env.SCREENING_PROVIDER === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY);
  } catch {
    return false;
  }
}

/** Kicks off screening after the response is sent. If it fails or isn't configured, the cron/worker picks the job up. */
export function screenSoon() {
  if (!isScreeningConfigured()) return;
  after(async () => {
    try {
      await runScreeningBatch(1);
    } catch (e) {
      console.error(JSON.stringify({ svc: "screening", msg: "background screening failed", error: e instanceof Error ? e.message : String(e) }));
    }
  });
}
