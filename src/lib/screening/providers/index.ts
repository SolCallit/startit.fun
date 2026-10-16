import "server-only";
import { screeningEnv } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import type { ScreeningProvider } from "./types";

export function getProvider(): ScreeningProvider {
  const env = screeningEnv();
  if (env.SCREENING_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("SCREENING_PROVIDER=openai but OPENAI_API_KEY is not set.");
    return new OpenAIProvider(env.SCREENING_MODEL, env.OPENAI_API_KEY);
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error("SCREENING_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.");
  return new AnthropicProvider(env.SCREENING_MODEL, env.ANTHROPIC_API_KEY);
}
export type { ScreeningProvider } from "./types";
