import {
  type AgentGenerationEndArgs,
  type AgentGenerationErrorArgs,
  type AgentGenerationObserver,
  type AgentGenerationStartArgs,
  type AgentObserver,
  type AgentRunEndArgs,
  type AgentRunErrorArgs,
  type AgentRunObserver,
  type AgentRunStartArgs,
  type AgentScoreArgs,
  type AgentToolEndArgs,
  type AgentToolErrorArgs,
  type AgentToolObserver,
  type AgentToolStartArgs,
  type AgentTraceInfo,
  textFromAssistantContent,
} from "@deltakit/aion";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  type LangfuseAgent,
  type LangfuseGeneration,
  LangfuseOtelSpanAttributes,
  type LangfuseSpan,
  type LangfuseTool,
  startObservation,
} from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";

export type LangfuseTracingOptions = {
  publicKey?: string | undefined;
  secretKey?: string | undefined;
  baseUrl?: string | undefined;
  environment?: string | undefined;
  release?: string | undefined;
};

export type LangfuseTracing = AgentObserver & {
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  score(args: AgentScoreArgs): Promise<void>;
};

export const langfuse = {
  fromEnv(options: LangfuseTracingOptions = {}): LangfuseTracing {
    return new LangfuseAgentObserver({
      publicKey: options.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: options.secretKey ?? process.env.LANGFUSE_SECRET_KEY,
      baseUrl: options.baseUrl ?? process.env.LANGFUSE_BASE_URL,
      environment: options.environment ?? process.env.LANGFUSE_ENVIRONMENT,
      release: options.release ?? process.env.LANGFUSE_RELEASE,
    });
  },
};

class LangfuseAgentObserver implements LangfuseTracing {
  private readonly processor: LangfuseSpanProcessor;
  private readonly sdk: NodeSDK;
  private readonly publicKey: string | undefined;
  private readonly secretKey: string | undefined;
  private readonly baseUrl: string;

  constructor(options: LangfuseTracingOptions) {
    this.publicKey = emptyToUndefined(options.publicKey);
    this.secretKey = emptyToUndefined(options.secretKey);
    this.baseUrl = emptyToUndefined(options.baseUrl) ?? "https://cloud.langfuse.com";
    const processorOptions: ConstructorParameters<typeof LangfuseSpanProcessor>[0] = {
      baseUrl: this.baseUrl,
    };
    if (this.publicKey !== undefined) processorOptions.publicKey = this.publicKey;
    if (this.secretKey !== undefined) processorOptions.secretKey = this.secretKey;
    const environment = emptyToUndefined(options.environment);
    if (environment !== undefined) processorOptions.environment = environment;
    const release = emptyToUndefined(options.release);
    if (release !== undefined) processorOptions.release = release;
    this.processor = new LangfuseSpanProcessor(processorOptions);
    this.sdk = new NodeSDK({
      spanProcessors: [this.processor],
    });
    this.sdk.start();
  }

  async startRun(args: AgentRunStartArgs): Promise<AgentRunObserver> {
    const traceId = args.trace?.traceId;
    const rootAttributes: Parameters<typeof startObservation>[1] = {
      input: {
        prompt: args.prompt,
        history: args.history,
      },
      metadata: {
        agentName: args.agentName,
        agentDescription: args.agentDescription,
        maxTurns: args.maxTurns,
        ...(args.trace?.metadata ?? {}),
      },
    };
    if (args.trace?.version !== undefined) {
      rootAttributes.version = args.trace.version;
    }

    const root = startObservation(
      args.agentName ?? "agent.run",
      rootAttributes,
      traceId === undefined
        ? { asType: "agent" }
        : {
            asType: "agent",
            parentSpanContext: {
              traceId,
              spanId: "0000000000000001",
              traceFlags: 1,
            },
          },
    );
    applyTraceAttributes(root, args);

    return new LangfuseRunObserver(root, {
      traceId: root.traceId,
      observationId: root.id,
    });
  }

  async flush(): Promise<void> {
    await this.processor.forceFlush();
  }

  async shutdown(): Promise<void> {
    await this.sdk.shutdown();
  }

  async score(args: AgentScoreArgs): Promise<void> {
    if (args.traceId === undefined || args.traceId.length === 0) {
      throw new Error("Langfuse score requires traceId");
    }
    if (this.publicKey === undefined || this.secretKey === undefined) {
      throw new Error("Langfuse score requires LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY");
    }

    const body: Record<string, unknown> = {
      traceId: args.traceId,
      name: args.name,
      value: args.value,
    };
    if (args.observationId !== undefined) body.observationId = args.observationId;
    if (args.comment !== undefined) body.comment = args.comment;
    if (args.metadata !== undefined) body.metadata = args.metadata;

    const response = await fetch(`${this.baseUrl}/api/public/scores`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.publicKey}:${this.secretKey}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `Langfuse score failed with HTTP ${response.status}: ${await response.text()}`,
      );
    }
  }
}

function applyTraceAttributes(root: LangfuseAgent, args: AgentRunStartArgs): void {
  const traceName = args.trace?.name ?? args.agentName;
  if (traceName !== undefined) {
    root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_NAME, traceName);
  }
  if (args.trace?.userId !== undefined) {
    root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, args.trace.userId);
  }
  if (args.trace?.sessionId !== undefined) {
    root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, args.trace.sessionId);
  }
  if (args.trace?.tags !== undefined) {
    root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, args.trace.tags);
  }
  for (const [key, value] of Object.entries(args.trace?.metadata ?? {})) {
    const serialized = serializeMetadataValue(value);
    if (serialized === undefined) {
      continue;
    }
    root.otelSpan.setAttribute(`${LangfuseOtelSpanAttributes.TRACE_METADATA}.${key}`, serialized);
  }
}

function serializeMetadataValue(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "<failed to serialize>";
  }
}

class LangfuseRunObserver implements AgentRunObserver {
  private readonly turnSpans = new Map<number, LangfuseSpan>();

  constructor(
    private readonly root: LangfuseAgent,
    readonly trace: AgentTraceInfo,
  ) {}

  startGeneration(args: AgentGenerationStartArgs): AgentGenerationObserver {
    this.closeEarlierTurns(args.turn);
    const turn = this.turnSpan(args.turn);
    const generation = turn.startObservation(
      `model.turn.${args.turn}`,
      {
        input: args.request.chatHistory,
        model: args.request.model ?? "default",
        modelParameters: modelParameters(args.request),
        metadata: {
          turn: args.turn,
          toolCount: args.request.tools.length,
          hasOutputSchema: args.request.outputSchema !== undefined,
        },
      },
      { asType: "generation" },
    );
    return new LangfuseGenerationObserver(generation);
  }

  startTool(args: AgentToolStartArgs): AgentToolObserver {
    const turn = this.turnSpan(args.turn);
    const tool = turn.startObservation(
      `tool.${args.toolName}`,
      {
        input: {
          args: args.args,
          toolCall: args.toolCall,
        },
        metadata: {
          turn: args.turn,
          internalCallId: args.internalCallId,
          toolCallId: args.toolCallId,
        },
      },
      { asType: "tool" },
    );
    return new LangfuseToolObserver(tool);
  }

  end(args: AgentRunEndArgs): void {
    this.closeAllTurns();
    this.root
      .update({
        output: args.output,
        metadata: {
          usage: args.usage,
          messages: args.messages,
        },
      })
      .end();
  }

  error(args: AgentRunErrorArgs): void {
    this.closeAllTurns();
    this.root
      .update({
        level: "ERROR",
        statusMessage: errorMessage(args.error),
        output: {
          error: errorMessage(args.error),
        },
        metadata: {
          usage: args.usage,
          messages: args.messages,
        },
      })
      .end();
  }

  private turnSpan(turn: number): LangfuseSpan {
    const existing = this.turnSpans.get(turn);
    if (existing !== undefined) {
      return existing;
    }

    const span = this.root.startObservation(
      `turn.${turn}`,
      {
        metadata: { turn },
      },
      { asType: "span" },
    );
    this.turnSpans.set(turn, span);
    return span;
  }

  private closeEarlierTurns(currentTurn: number): void {
    for (const [turn, span] of this.turnSpans) {
      if (turn < currentTurn) {
        span.end();
        this.turnSpans.delete(turn);
      }
    }
  }

  private closeAllTurns(): void {
    for (const span of this.turnSpans.values()) {
      span.end();
    }
    this.turnSpans.clear();
  }
}

class LangfuseGenerationObserver implements AgentGenerationObserver {
  constructor(private readonly generation: LangfuseGeneration) {}

  end(args: AgentGenerationEndArgs): void {
    this.generation
      .update({
        output: {
          messageId: args.response.messageId,
          content: args.response.choice,
          text: textFromAssistantContent(args.response.choice),
        },
        usageDetails: usageDetails(args.response.usage),
        metadata: {
          turn: args.turn,
        },
      })
      .end();
  }

  error(args: AgentGenerationErrorArgs): void {
    this.generation
      .update({
        level: "ERROR",
        statusMessage: errorMessage(args.error),
        output: { error: errorMessage(args.error) },
        metadata: { turn: args.turn },
      })
      .end();
  }
}

class LangfuseToolObserver implements AgentToolObserver {
  constructor(private readonly tool: LangfuseTool) {}

  end(args: AgentToolEndArgs): void {
    const attributes: Parameters<LangfuseTool["update"]>[0] = {
      output: args.result,
      metadata: {
        turn: args.turn,
        internalCallId: args.internalCallId,
        toolCallId: args.toolCallId,
        skipped: args.skipped,
      },
      level: args.skipped ? "WARNING" : "DEFAULT",
    };
    if (args.skipped) {
      attributes.statusMessage = "Tool call skipped by hook";
    }
    this.tool.update(attributes).end();
  }

  error(args: AgentToolErrorArgs): void {
    this.tool
      .update({
        level: "ERROR",
        statusMessage: errorMessage(args.error),
        output: { error: errorMessage(args.error) },
        metadata: {
          turn: args.turn,
          internalCallId: args.internalCallId,
          toolCallId: args.toolCallId,
        },
      })
      .end();
  }
}

function modelParameters(
  request: AgentGenerationStartArgs["request"],
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (request.temperature !== undefined) params.temperature = request.temperature;
  if (request.maxTokens !== undefined) params.maxTokens = request.maxTokens;
  if (request.toolChoice !== undefined) {
    params.toolChoice =
      typeof request.toolChoice === "string" ? request.toolChoice : request.toolChoice.name;
  }
  return params;
}

function usageDetails(usage: AgentGenerationEndArgs["response"]["usage"]): Record<string, number> {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
