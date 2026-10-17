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

/**
 * The Supabase↔Vercel integration may set the newer key names
 * (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY). Accept either.
 */
function source(): Record<string, string | undefined> {
  const e = process.env;
  return {
    ...e,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: e.NEXT_PUBLIC_SUPABASE_ANON_KEY || e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_SECRET_KEY,
  };
}

export function isSupabaseConfigured(): boolean {
  return publicSchema.safeParse(source()).success;
}

export function supabasePublicEnv() {
  const parsed = publicSchema.safeParse(source());
  if (!parsed.success) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return parsed.data;
}

function parseOrExplain<T extends z.ZodType>(schema: T, what: string): z.infer<T> {
  const r = schema.safeParse(source());
  if (r.success) return r.data;
  const keys = [...new Set(r.error.issues.map((i) => String(i.path[0])))].join(", ");
  throw new Error(`${what} is not configured. Missing or invalid: ${keys}. See .env.example.`);
}

export function supabaseServiceEnv() {
  return { ...supabasePublicEnv(), ...parseOrExplain(serverSchema, "Supabase service access") };
}

export function screeningEnv() {
  return parseOrExplain(screeningSchema, "AI screening");
}
