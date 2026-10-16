import "server-only";
import { z } from "zod";

/**
 * Server environment, validated lazily so the app still builds (and public pages still render)
 * before Supabase / AI keys are configured. Anything that needs a value calls the getter and
 * gets a clear error instead of a silent `undefined`.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

const screeningSchema = z.object({
  SCREENING_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  SCREENING_MODEL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  SCREENING_SERVICE_EMAIL: z.email(),
  SCREENING_SERVICE_PASSWORD: z.string().min(12),
});

export function isSupabaseConfigured(): boolean {
  return publicSchema.safeParse(process.env).success;
}

export function supabasePublicEnv() {
  const parsed = publicSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return parsed.data;
}

export function supabaseServiceEnv() {
  return { ...supabasePublicEnv(), ...serverSchema.parse(process.env) };
}

export function screeningEnv() {
  return screeningSchema.parse(process.env);
}
