import OpenAI from "openai";
import type { ProviderEmbeddingModelOptions } from "../openai/embedding";
import { OpenRouterCompletionModel } from "./completion";
import { OpenRouterEmbeddingModel } from "./embedding";

export type OpenRouterClientOptions = {
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  siteUrl?: string | undefined;
  siteName?: string | undefined;
  client?: OpenAI | undefined;
};

export class OpenRouterClient {
  readonly client: OpenAI;

  constructor(options: OpenRouterClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
    this.client =
      options.client ??
      new OpenAI({
        apiKey: requireApiKey(apiKey),
        baseURL: options.baseURL ?? "https://openrouter.ai/api/v1",
        defaultHeaders: openRouterHeaders(options),
      });
  }

  static fromEnv(): OpenRouterClient {
    return new OpenRouterClient({
      apiKey: process.env.OPENROUTER_API_KEY,
      siteUrl: process.env.OPENROUTER_SITE_URL,
      siteName: process.env.OPENROUTER_SITE_NAME,
    });
  }

  completionModel(model = "openai/gpt-5.2"): OpenRouterCompletionModel {
    return new OpenRouterCompletionModel(this.client, model);
  }

  embeddingModel(
    model = process.env.OPENROUTER_EMBEDDING_MODEL,
    options: ProviderEmbeddingModelOptions = {},
  ): OpenRouterEmbeddingModel {
    return new OpenRouterEmbeddingModel(this.client, requireEmbeddingModel(model), options);
  }
}

function requireApiKey(apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error(
      "Missing OpenRouter credentials. Set OPENROUTER_API_KEY in the root .env file.",
    );
  }

  return apiKey;
}

function requireEmbeddingModel(model: string | undefined): string {
  if (model === undefined || model.length === 0) {
    throw new Error(
      "Missing OpenRouter embedding model. Pass model or set OPENROUTER_EMBEDDING_MODEL.",
    );
  }

  return model;
}

function openRouterHeaders(options: OpenRouterClientOptions): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (options.siteUrl !== undefined && options.siteUrl.length > 0) {
    headers["HTTP-Referer"] = options.siteUrl;
  }
  if (options.siteName !== undefined && options.siteName.length > 0) {
    headers["X-OpenRouter-Title"] = options.siteName;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}
