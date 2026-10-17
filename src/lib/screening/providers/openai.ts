import "server-only";
import { ProviderError, type ScreeningProvider } from "./types";

export class OpenAIProvider implements ScreeningProvider {
  readonly name = "openai" as const;
  constructor(readonly model: string, private readonly apiKey: string) {}

  async complete({ system, user, maxTokens }: { system: string; user: string; maxTokens: number }) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new ProviderError(`OpenAI API ${res.status}: ${body}`, res.status === 429 || res.status >= 500);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const choice = data.choices?.[0];
    if (!choice?.message?.content) throw new ProviderError("OpenAI API returned no content", true);
    if (choice.finish_reason === "length") throw new ProviderError("Response truncated at max tokens", true);
    return choice.message.content;
  }
}
