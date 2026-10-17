import "server-only";
import { ProviderError, type ScreeningProvider } from "./types";

// Docs: https://platform.claude.com/docs/en/api/overview — POST /v1/messages, x-api-key, anthropic-version.
export class AnthropicProvider implements ScreeningProvider {
  readonly name = "anthropic" as const;
  constructor(readonly model: string, private readonly apiKey: string) {}

  async complete({ system, user, maxTokens }: { system: string; user: string; maxTokens: number }) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new ProviderError(`Anthropic API ${res.status}: ${body}`, res.status === 429 || res.status >= 500);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (!text) throw new ProviderError("Anthropic API returned no text", true);
    if (data.stop_reason === "max_tokens") throw new ProviderError("Response truncated at max_tokens", true);
    return text;
  }
}
