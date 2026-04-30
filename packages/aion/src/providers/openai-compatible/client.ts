import OpenAI from "openai";
import type { ProviderEmbeddingModelOptions } from "../openai/embedding";
import { OpenAICompatibleCompletionModel } from "./completion";
import { OpenAICompatibleEmbeddingModel } from "./embedding";

export type OpenAICompatibleClientOptions = {
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  model?: string | undefined;
  headers?: Record<string, string> | undefined;
  client?: OpenAI | undefined;
};

export class OpenAICompatibleClient {
  readonly client: OpenAI;
  private readonly defaultModel: string | undefined;
  private readonly defaultEmbeddingModel: string | undefined;

  constructor(options: OpenAICompatibleClientOptions = {}) {
    this.defaultModel = options.model;
    this.defaultEmbeddingModel = process.env.OPENAI_COMPATIBLE_EMBEDDING_MODEL;
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey ?? "not-needed",
        baseURL: requireBaseURL(options.baseURL),
        defaultHeaders: options.headers,
      });
  }

  static fromEnv(): OpenAICompatibleClient {
    return new OpenAICompatibleClient({
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL,
      model: process.env.OPENAI_COMPATIBLE_MODEL,
    });
  }

  completionModel(model = this.defaultModel): OpenAICompatibleCompletionModel {
    return new OpenAICompatibleCompletionModel(this.client, requireModel(model));
  }

  embeddingModel(
    model = this.defaultEmbeddingModel,
    options: ProviderEmbeddingModelOptions = {},
  ): OpenAICompatibleEmbeddingModel {
    return new OpenAICompatibleEmbeddingModel(this.client, requireEmbeddingModel(model), options);
  }
}

function requireBaseURL(baseURL: string | undefined): string {
  if (baseURL === undefined || baseURL.length === 0) {
    throw new Error(
      "Missing OpenAI-compatible base URL. Pass baseURL or set OPENAI_COMPATIBLE_BASE_URL.",
    );
  }

  return baseURL;
}

function requireModel(model: string | undefined): string {
  if (model === undefined || model.length === 0) {
    throw new Error("Missing OpenAI-compatible model. Pass model or set OPENAI_COMPATIBLE_MODEL.");
  }

  return model;
}

function requireEmbeddingModel(model: string | undefined): string {
  if (model === undefined || model.length === 0) {
    throw new Error(
      "Missing OpenAI-compatible embedding model. Pass model or set OPENAI_COMPATIBLE_EMBEDDING_MODEL.",
    );
  }

  return model;
}
