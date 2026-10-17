/** Provider-agnostic text completion. Swap providers via SCREENING_PROVIDER without touching the pipeline. */
export interface ScreeningProvider {
  readonly name: "anthropic" | "openai";
  readonly model: string;
  complete(req: { system: string; user: string; maxTokens: number }): Promise<string>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}
