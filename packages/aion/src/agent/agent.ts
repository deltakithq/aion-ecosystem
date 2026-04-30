import { z } from "zod";
import type {
  CompletionModel,
  Document,
  JsonObject,
  JsonValue,
  Message as MessageType,
  ToolChoice,
} from "../completion/index";
import type { AgentObserverRegistration } from "../observability";
import { createTool } from "../tool/create-tool";
import { ToolRegistry } from "../tool/registry";
import type { Tool } from "../tool/tool";
import type { VectorFilter, VectorSearchResult, VectorStoreIndex } from "../vector-store";
import type { PromptHook } from "./hooks";
import { PromptRequest } from "./request";

export type AgentOptions<M extends CompletionModel = CompletionModel> = {
  id: string;
  name?: string | undefined;
  description?: string | undefined;
  model: M;
  instructions?: string | undefined;
  staticContext?: Document[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  additionalParams?: JsonValue | undefined;
  toolRegistry?: ToolRegistry | undefined;
  toolChoice?: ToolChoice | undefined;
  defaultMaxTurns?: number | undefined;
  hook?: PromptHook | undefined;
  outputSchema?: JsonObject | undefined;
  observers?: AgentObserverRegistration[] | undefined;
  dynamicContexts?: DynamicContextRegistration[] | undefined;
};

export const DEFAULT_MAX_TURNS = 20;

export type AgentToolOptions = {
  name: string;
  description?: string | undefined;
  maxTurns?: number | undefined;
};

export type DynamicContextOptions<T = unknown> = {
  topK: number;
  threshold?: number | undefined;
  filter?: VectorFilter | undefined;
  format?: ((result: VectorSearchResult<T>) => Document) | undefined;
};

export type DynamicContextRegistration<T = unknown> = {
  index: VectorStoreIndex<T>;
  options: DynamicContextOptions<T>;
};

export class Agent<M extends CompletionModel = CompletionModel> {
  readonly id: string;
  readonly name: string | undefined;
  readonly description: string | undefined;
  readonly model: M;
  readonly instructions: string | undefined;
  readonly staticContext: Document[];
  readonly temperature: number | undefined;
  readonly maxTokens: number | undefined;
  readonly additionalParams: JsonValue | undefined;
  readonly toolRegistry: ToolRegistry;
  readonly toolChoice: ToolChoice | undefined;
  readonly defaultMaxTurns: number | undefined;
  readonly hook: PromptHook | undefined;
  readonly outputSchema: JsonObject | undefined;
  readonly observers: AgentObserverRegistration[];
  readonly dynamicContexts: DynamicContextRegistration[];

  constructor(options: AgentOptions<M>) {
    this.id = normalizeAgentId(options.id);
    this.name = options.name;
    this.description = options.description;
    this.model = options.model;
    this.instructions = options.instructions;
    this.staticContext = options.staticContext ?? [];
    this.temperature = options.temperature;
    this.maxTokens = options.maxTokens;
    this.additionalParams = options.additionalParams;
    this.toolRegistry = options.toolRegistry ?? new ToolRegistry();
    this.toolChoice = options.toolChoice;
    this.defaultMaxTurns = options.defaultMaxTurns ?? DEFAULT_MAX_TURNS;
    this.hook = options.hook;
    this.outputSchema = options.outputSchema;
    this.observers = options.observers ?? [];
    this.dynamicContexts = options.dynamicContexts ?? [];
  }

  prompt(prompt: string | MessageType): PromptRequest<M> {
    return PromptRequest.fromAgent(this, prompt);
  }

  asTool(options: AgentToolOptions): Tool<{ prompt: string }, string> {
    const description =
      options.description ?? this.description ?? `Prompt the ${options.name} agent.`;

    return createTool({
      name: options.name,
      description,
      input: z.object({
        prompt: z.string().describe("The prompt to send to the agent."),
      }),
      output: z.string(),
      execute: async ({ prompt }) => {
        const request = this.prompt(prompt);
        const response =
          options.maxTurns === undefined
            ? await request.send()
            : await request.maxTurns(options.maxTurns).send();
        return response.output;
      },
    });
  }
}

function normalizeAgentId(id: string): string {
  if (typeof id !== "string") {
    throw new TypeError("Agent id must be a string.");
  }

  const normalized = id.trim();
  if (normalized.length === 0) {
    throw new TypeError("Agent id must be a non-empty string.");
  }

  return normalized;
}
