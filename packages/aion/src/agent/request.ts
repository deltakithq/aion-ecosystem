import {
  type CompletionModel,
  CompletionRequestBuilder,
  type CompletionResponse,
  type Document,
  Message,
  type Message as MessageType,
  type ToolCall,
  type ToolResult,
  textFromAssistantContent,
  Usage,
  UserContent,
} from "../completion/index";
import {
  type ActiveAgentRunObservers,
  type ActiveToolObservers,
  startAgentRunObservers,
} from "../observability/group";
import type { AgentTraceInfo, AgentTraceOptions } from "../observability/types";
import { toReadableStream } from "../streaming";
import type { Agent } from "./agent";
import { MaxTurnsError, PromptCancelledError } from "./errors";
import type {
  PromptHook,
  ToolApprovalEvent,
  ToolApprovalHandler,
  ToolApprovalRequest,
  ToolApprovalRequiredAction,
  ToolApprovalResult,
  ToolCallHookArgs,
} from "./hooks";
import { type AgentDeltaEvent, CompletionStreamAccumulator } from "./stream-accumulator";
import { extractRagText, isStreamingCompletionModel, mapWithConcurrency } from "./utils";

export type PromptResponse = {
  output: string;
  usage: Usage;
  messages: MessageType[];
  trace?: AgentTraceInfo | undefined;
};

export type AgentStreamEvent<RawResponse = unknown> =
  | {
      type: "turn_start";
      turn: number;
      prompt: MessageType;
      history: MessageType[];
    }
  | {
      type: "text_delta";
      turn: number;
      delta: string;
    }
  | {
      type: "reasoning_delta";
      turn: number;
      delta: string;
      id?: string;
    }
  | {
      type: "tool_call";
      turn: number;
      toolCall: ToolCall;
    }
  | {
      type: "tool_result";
      turn: number;
      toolName: string;
      toolCallId?: string;
      internalCallId: string;
      args: string;
      result: string;
    }
  | (ToolApprovalEvent & { turn: number })
  | {
      type: "turn_end";
      turn: number;
      response: CompletionResponse<RawResponse>;
    }
  | {
      type: "final";
      output: string;
      usage: Usage;
      messages: MessageType[];
      trace?: AgentTraceInfo | undefined;
    }
  | {
      type: "error";
      error: unknown;
    };

export class PromptRequest<M extends CompletionModel = CompletionModel> {
  private chatHistory: MessageType[] | undefined;
  private maxTurnCount: number;
  private requestHook: PromptHook | undefined;
  private toolApprovalHandler: ToolApprovalHandler | undefined;
  private concurrency = 1;
  private traceOptions: AgentTraceOptions | undefined;

  private constructor(
    private readonly agent: Agent<M>,
    private readonly promptMessage: MessageType,
  ) {
    this.maxTurnCount = agent.defaultMaxTurns ?? 0;
    this.requestHook = agent.hook;
  }

  static fromAgent<M extends CompletionModel>(
    agent: Agent<M>,
    prompt: string | MessageType,
  ): PromptRequest<M> {
    return new PromptRequest(agent, typeof prompt === "string" ? Message.user(prompt) : prompt);
  }

  withHistory(history: MessageType[]): this {
    this.chatHistory = history;
    return this;
  }

  maxTurns(maxTurns: number): this {
    this.maxTurnCount = maxTurns;
    return this;
  }

  withHook(hook: PromptHook): this {
    this.requestHook = hook;
    return this;
  }

  withToolConcurrency(concurrency: number): this {
    this.concurrency = Math.max(1, concurrency);
    return this;
  }

  withToolApprovalHandler(handler: ToolApprovalHandler): this {
    this.toolApprovalHandler = handler;
    return this;
  }

  withTrace(trace: AgentTraceOptions): this {
    this.traceOptions = trace;
    return this;
  }

  async send(): Promise<PromptResponse> {
    const newMessages: MessageType[] = [this.promptMessage];
    let usage = Usage.empty();
    let currentTurns = 0;
    let lastPrompt = this.promptMessage;
    const runObservers = await this.startRunObservers();

    try {
      while (currentTurns <= this.maxTurnCount + 1) {
        const prompt = newMessages.at(-1);
        if (prompt === undefined) {
          throw new Error("PromptRequest requires at least one message");
        }

        lastPrompt = prompt;
        currentTurns += 1;

        const historyForRequest = [...(this.chatHistory ?? []), ...newMessages.slice(0, -1)];
        await this.runCompletionCallHook(prompt, historyForRequest, newMessages);

        const ragText = extractRagText(prompt);
        const dynamicContext = await this.fetchDynamicContext(ragText);
        const toolDefs = await this.agent.toolServerHandle.getToolDefs(ragText);
        const request = new CompletionRequestBuilder(this.agent.model, prompt)
          .instructions(this.agent.instructions)
          .messages(historyForRequest)
          .documents([...this.agent.staticContext, ...dynamicContext])
          .tools(toolDefs)
          .temperature(this.agent.temperature)
          .maxTokens(this.agent.maxTokens)
          .additionalParams(this.agent.additionalParams)
          .toolChoice(this.agent.toolChoice)
          .outputSchema(this.agent.outputSchema)
          .build();

        const response = await this.runCompletion(request, currentTurns, runObservers);
        usage = Usage.add(usage, response.usage);
        await this.runCompletionResponseHook(prompt, response, newMessages);

        newMessages.push(Message.assistant(response.choice, response.messageId));
        const toolCalls = response.choice.filter(
          (item): item is ToolCall => item.type === "tool_call",
        );
        if (toolCalls.length === 0) {
          const result: PromptResponse = {
            output: textFromAssistantContent(response.choice),
            usage,
            messages: [...newMessages],
            trace: runObservers.trace,
          };
          await runObservers.end(result);
          return result;
        }

        const toolResults = await this.executeToolCalls(toolCalls, newMessages, undefined, {
          turn: currentTurns,
          runObservers,
        });
        newMessages.push(Message.user(toolResults));
      }

      throw new MaxTurnsError(
        this.maxTurnCount,
        [...(this.chatHistory ?? []), ...newMessages],
        lastPrompt,
      );
    } catch (error) {
      await runObservers.error({ error, usage, messages: [...newMessages] });
      throw error;
    }
  }

  async *stream(): AsyncIterable<AgentStreamEvent> {
    if (!isStreamingCompletionModel(this.agent.model)) {
      throw new Error("This completion model does not support streaming");
    }

    const newMessages: MessageType[] = [this.promptMessage];
    let usage = Usage.empty();
    let currentTurns = 0;
    let lastPrompt = this.promptMessage;
    const runObservers = await this.startRunObservers();

    try {
      while (currentTurns <= this.maxTurnCount + 1) {
        const prompt = newMessages.at(-1);
        if (prompt === undefined) {
          throw new Error("PromptRequest requires at least one message");
        }

        lastPrompt = prompt;
        currentTurns += 1;

        const historyForRequest = [...(this.chatHistory ?? []), ...newMessages.slice(0, -1)];
        yield {
          type: "turn_start",
          turn: currentTurns,
          prompt,
          history: historyForRequest,
        };
        await this.runCompletionCallHook(prompt, historyForRequest, newMessages);

        const ragText = extractRagText(prompt);
        const dynamicContext = await this.fetchDynamicContext(ragText);
        const toolDefs = await this.agent.toolServerHandle.getToolDefs(ragText);
        const request = new CompletionRequestBuilder(this.agent.model, prompt)
          .instructions(this.agent.instructions)
          .messages(historyForRequest)
          .documents([...this.agent.staticContext, ...dynamicContext])
          .tools(toolDefs)
          .temperature(this.agent.temperature)
          .maxTokens(this.agent.maxTokens)
          .additionalParams(this.agent.additionalParams)
          .toolChoice(this.agent.toolChoice)
          .outputSchema(this.agent.outputSchema)
          .build();

        const generationObservers = await runObservers.startGeneration({
          turn: currentTurns,
          request,
        });
        const accumulator = new CompletionStreamAccumulator();
        const generationStartedAt = Date.now();
        let firstDeltaMs: number | undefined;
        try {
          for await (const event of this.agent.model.streamCompletion(request)) {
            if (firstDeltaMs === undefined && isGenerationDeltaEvent(event.type)) {
              firstDeltaMs = Date.now() - generationStartedAt;
            }
            const mapped = accumulator.accept(event);
            if (event.type === "error") {
              throw event.error;
            }
            if (mapped !== undefined) {
              yield addTurn(currentTurns, mapped);
            }
          }
        } catch (error) {
          await generationObservers.error({ turn: currentTurns, error });
          throw error;
        }

        const response = accumulator.response();
        await generationObservers.end({
          turn: currentTurns,
          response,
          ...(firstDeltaMs === undefined ? {} : { firstDeltaMs }),
        });
        usage = Usage.add(usage, response.usage);
        await this.runCompletionResponseHook(prompt, response, newMessages);

        newMessages.push(Message.assistant(response.choice, response.messageId));
        const toolCalls = response.choice.filter(
          (item): item is ToolCall => item.type === "tool_call",
        );
        for (const toolCall of toolCalls) {
          yield { type: "tool_call", turn: currentTurns, toolCall };
        }
        yield { type: "turn_end", turn: currentTurns, response };

        if (toolCalls.length === 0) {
          const output = textFromAssistantContent(response.choice);
          yield {
            type: "final",
            output,
            usage,
            messages: [...newMessages],
            trace: runObservers.trace,
          };
          await runObservers.end({ output, usage, messages: [...newMessages] });
          return;
        }

        const toolResultEvents: ToolResultEventPayload[] = [];
        const toolResults = await this.executeToolCalls(
          toolCalls,
          newMessages,
          (result) => {
            toolResultEvents.push(result);
          },
          {
            turn: currentTurns,
            runObservers,
          },
        );
        for (const result of toolResultEvents) {
          yield { type: "tool_result", turn: currentTurns, ...result };
        }
        newMessages.push(Message.user(toolResults));
      }

      throw new MaxTurnsError(
        this.maxTurnCount,
        [...(this.chatHistory ?? []), ...newMessages],
        lastPrompt,
      );
    } catch (error) {
      await runObservers.error({ error, usage, messages: [...newMessages] });
      yield { type: "error", error };
      throw error;
    }
  }

  readableStream(): ReadableStream<Uint8Array> {
    return toReadableStream(this.stream());
  }

  private async runCompletion(
    request: ReturnType<CompletionRequestBuilder["build"]>,
    turn: number,
    runObservers: ActiveAgentRunObservers,
  ): Promise<CompletionResponse> {
    const generationObservers = await runObservers.startGeneration({ turn, request });
    try {
      const response = await this.agent.model.completion(request);
      await generationObservers.end({ turn, response });
      return response;
    } catch (error) {
      await generationObservers.error({ turn, error });
      throw error;
    }
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    newMessages: MessageType[],
    onResult?: (result: ToolResultEventPayload) => void,
    observation?: {
      turn: number;
      runObservers: ActiveAgentRunObservers;
    },
  ): Promise<ToolResult[]> {
    return mapWithConcurrency(toolCalls, this.concurrency, async (toolCall) => {
      const args = JSON.stringify(toolCall.function.arguments ?? {});
      const internalCallId = globalThis.crypto.randomUUID();
      const hookArgs: ToolCallHookArgs = {
        toolName: toolCall.function.name,
        internalCallId,
        args,
      };
      if (toolCall.callId !== undefined) {
        hookArgs.toolCallId = toolCall.callId;
      }

      const toolObservers = await observation?.runObservers.startTool({
        turn: observation.turn,
        toolCall,
        toolName: toolCall.function.name,
        internalCallId,
        args,
        toolCallId: toolCall.callId,
      });

      const callAction = await this.requestHook?.onToolCall?.(hookArgs);
      if (callAction?.type === "terminate") {
        await this.recordToolError(
          toolObservers,
          observation?.turn,
          toolCall,
          internalCallId,
          args,
          callAction.reason,
        );
        throw this.cancelled(newMessages, callAction.reason);
      }

      let output: string;
      let skipped = false;
      if (callAction?.type === "skip") {
        output = callAction.reason;
        skipped = true;
      } else if (callAction?.type === "require_approval") {
        const approval = await this.requestToolApproval(hookArgs, callAction);
        if (approval.status === "approved") {
          try {
            output = await this.agent.toolServerHandle.callTool(toolCall.function.name, args);
          } catch (error) {
            output = error instanceof Error ? error.toString() : String(error);
          }
        } else if (approval.status === "timed_out") {
          output = approval.reason ?? callAction.timeoutMessage ?? "Approval timed out.";
          skipped = true;
        } else {
          output = approval.reason ?? callAction.rejectMessage ?? "Approval was rejected.";
          skipped = true;
        }
      } else {
        try {
          output = await this.agent.toolServerHandle.callTool(toolCall.function.name, args);
        } catch (error) {
          output = error instanceof Error ? error.toString() : String(error);
        }
      }

      const resultAction = await this.requestHook?.onToolResult?.({
        ...hookArgs,
        result: output,
      });
      await toolObservers?.end({
        turn: observation?.turn ?? 0,
        toolCall,
        toolName: toolCall.function.name,
        internalCallId,
        args,
        result: output,
        skipped,
        toolCallId: toolCall.callId,
      });
      if (resultAction?.type === "terminate") {
        throw this.cancelled(newMessages, resultAction.reason);
      }

      const resultPayload: ToolResultEventPayload = {
        toolName: toolCall.function.name,
        internalCallId,
        args,
        result: output,
      };
      if (toolCall.callId !== undefined) {
        resultPayload.toolCallId = toolCall.callId;
      }
      onResult?.(resultPayload);
      return UserContent.toolResult(toolCall.id, output, toolCall.callId);
    });
  }

  private async startRunObservers(): Promise<ActiveAgentRunObservers> {
    const failOnObserverError =
      this.traceOptions?.failOnObserverError === true ||
      this.agent.observers.some((registration) => registration.failOnObserverError === true);
    return startAgentRunObservers(
      this.agent.observers,
      {
        agentName: this.agent.name,
        agentDescription: this.agent.description,
        trace: this.traceOptions,
        prompt: this.promptMessage,
        history: this.chatHistory ?? [],
        maxTurns: this.maxTurnCount,
      },
      failOnObserverError,
    );
  }

  private async fetchDynamicContext(ragText: string | undefined): Promise<Document[]> {
    if (ragText === undefined || ragText.length === 0 || this.agent.dynamicContexts.length === 0) {
      return [];
    }

    const documents: Document[] = [];
    for (const registration of this.agent.dynamicContexts) {
      const results = await registration.index.search({
        query: ragText,
        topK: registration.options.topK,
        threshold: registration.options.threshold,
        filter: registration.options.filter,
      });
      for (const result of results) {
        const formatted = registration.options.format?.(result);
        if (formatted !== undefined) {
          documents.push(formatted);
        } else {
          const metadata = formatMetadata(result.metadata);
          documents.push({
            id: result.id,
            text:
              typeof result.document === "string"
                ? result.document
                : JSON.stringify(result.document, null, 2),
            ...(metadata === undefined ? {} : { additionalProps: metadata }),
          });
        }
      }
    }
    return documents;
  }

  private async recordToolError(
    toolObservers: ActiveToolObservers | undefined,
    turn: number | undefined,
    toolCall: ToolCall,
    internalCallId: string,
    args: string,
    error: unknown,
  ): Promise<void> {
    await toolObservers?.error({
      turn: turn ?? 0,
      toolCall,
      toolName: toolCall.function.name,
      internalCallId,
      args,
      error,
      toolCallId: toolCall.callId,
    });
  }

  private async runCompletionCallHook(
    prompt: MessageType,
    history: MessageType[],
    newMessages: MessageType[],
  ): Promise<void> {
    const action = await this.requestHook?.onCompletionCall?.({ prompt, history });
    if (action?.type === "terminate") {
      throw this.cancelled(newMessages, action.reason);
    }
  }

  private async runCompletionResponseHook(
    prompt: MessageType,
    response:
      | Awaited<ReturnType<M["completion"]>>
      | Awaited<ReturnType<CompletionModel["completion"]>>,
    newMessages: MessageType[],
  ): Promise<void> {
    const action = await this.requestHook?.onCompletionResponse?.({ prompt, response });
    if (action?.type === "terminate") {
      throw this.cancelled(newMessages, action.reason);
    }
  }

  private async requestToolApproval(
    hookArgs: ToolCallHookArgs,
    action: ToolApprovalRequiredAction,
  ): Promise<ToolApprovalResult> {
    const approval: ToolApprovalRequest = {
      id: globalThis.crypto.randomUUID(),
      toolName: hookArgs.toolName,
      ...(hookArgs.toolCallId === undefined ? {} : { toolCallId: hookArgs.toolCallId }),
      internalCallId: hookArgs.internalCallId,
      args: hookArgs.args,
      status: "pending",
      requestedAt: new Date().toISOString(),
      ...(action.reason === undefined ? {} : { reason: action.reason }),
    };

    if (this.toolApprovalHandler === undefined) {
      return {
        ...approval,
        status: "rejected",
        resolvedAt: new Date().toISOString(),
        reason:
          action.rejectMessage ?? "Approval is required but no approval runtime is available.",
      };
    }

    return this.toolApprovalHandler(approval, action);
  }

  private cancelled(newMessages: MessageType[], reason: string): PromptCancelledError {
    return new PromptCancelledError([...(this.chatHistory ?? []), ...newMessages], reason);
  }
}

type ToolResultEventPayload = {
  toolName: string;
  toolCallId?: string;
  internalCallId: string;
  args: string;
  result: string;
};

function addTurn(turn: number, event: AgentDeltaEvent): AgentStreamEvent {
  if (event.type === "text_delta") {
    return { type: "text_delta", turn, delta: event.delta };
  }
  if (event.type === "reasoning_delta") {
    return event.id === undefined
      ? { type: "reasoning_delta", turn, delta: event.delta }
      : { type: "reasoning_delta", turn, delta: event.delta, id: event.id };
  }
  return { type: "tool_call", turn, toolCall: event.toolCall };
}

function isGenerationDeltaEvent(type: string): boolean {
  return (
    type === "text_delta" ||
    type === "reasoning_delta" ||
    type === "tool_call_delta" ||
    type === "tool_call"
  );
}

function formatMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, String(value)]));
}
