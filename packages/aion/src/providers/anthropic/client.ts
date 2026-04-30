import Anthropic from "@anthropic-ai/sdk";
import { AnthropicCompletionModel } from "./completion";

export type AnthropicClientOptions = {
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  client?: Anthropic | undefined;
};

export class AnthropicClient {
  readonly client: Anthropic;

  constructor(options: AnthropicClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.client =
      options.client ??
      new Anthropic({
        apiKey: requireApiKey(apiKey),
        baseURL: options.baseURL,
      });
  }

  static fromEnv(): AnthropicClient {
    return new AnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  completionModel(model = "claude-sonnet-4-20250514"): AnthropicCompletionModel {
    return new AnthropicCompletionModel(this.client, model);
  }
}

function requireApiKey(apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("Missing Anthropic credentials. Set ANTHROPIC_API_KEY in the root .env file.");
  }

  return apiKey;
}
