import Anthropic from "@anthropic-ai/sdk";
import { AnthropicCompatibleCompletionModel } from "./completion";

export type AnthropicCompatibleClientOptions = {
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  model?: string | undefined;
  client?: Anthropic | undefined;
};

export class AnthropicCompatibleClient {
  readonly client: Anthropic;
  private readonly defaultModel: string | undefined;

  constructor(options: AnthropicCompatibleClientOptions = {}) {
    this.defaultModel = options.model;
    this.client =
      options.client ??
      new Anthropic({
        apiKey: options.apiKey ?? "not-needed",
        baseURL: requireBaseURL(options.baseURL),
      });
  }

  static fromEnv(): AnthropicCompatibleClient {
    return new AnthropicCompatibleClient({
      apiKey: process.env.ANTHROPIC_COMPATIBLE_API_KEY,
      baseURL: process.env.ANTHROPIC_COMPATIBLE_BASE_URL,
      model: process.env.ANTHROPIC_COMPATIBLE_MODEL,
    });
  }

  completionModel(model = this.defaultModel): AnthropicCompatibleCompletionModel {
    return new AnthropicCompatibleCompletionModel(this.client, requireModel(model));
  }
}

function requireBaseURL(baseURL: string | undefined): string {
  if (baseURL === undefined || baseURL.length === 0) {
    throw new Error(
      "Missing Anthropic-compatible base URL. Pass baseURL or set ANTHROPIC_COMPATIBLE_BASE_URL.",
    );
  }

  return baseURL;
}

function requireModel(model: string | undefined): string {
  if (model === undefined || model.length === 0) {
    throw new Error(
      "Missing Anthropic-compatible model. Pass model or set ANTHROPIC_COMPATIBLE_MODEL.",
    );
  }

  return model;
}
