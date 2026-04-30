import OpenAI from "openai";
import { OpenAIEmbeddingModel, type ProviderEmbeddingModelOptions } from "./embedding";
import { OpenAIResponsesCompletionModel } from "./responses";

export type OpenAIClientOptions = {
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  client?: OpenAI | undefined;
};

export class OpenAIClient {
  readonly client: OpenAI;

  constructor(options: OpenAIClientOptions = {}) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
      });
  }

  static fromEnv(): OpenAIClient {
    return new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY });
  }

  completionModel(model = "gpt-5"): OpenAIResponsesCompletionModel {
    return new OpenAIResponsesCompletionModel(this.client, model);
  }

  embeddingModel(
    model = "text-embedding-3-small",
    options: ProviderEmbeddingModelOptions = {},
  ): OpenAIEmbeddingModel {
    return new OpenAIEmbeddingModel(this.client, model, options);
  }
}
