import type {
  AssistantContent as AssistantContentType,
  CompletionResponse,
  CompletionStreamEvent,
  ToolCall,
} from "../completion/index";
import { Usage } from "../completion/index";
import { parseJsonValue } from "./utils";

export type AgentDeltaEvent =
  | { type: "text_delta"; delta: string }
  | { type: "reasoning_delta"; delta: string; id?: string }
  | { type: "tool_call"; toolCall: ToolCall };

type PartialToolCall = {
  id: string;
  callId?: string;
  name: string;
  argumentsText: string;
};

export class CompletionStreamAccumulator<RawResponse = unknown> {
  private static readonly defaultReasoningKey = "reasoning";
  private text = "";
  private reasoningTextById = new Map<string, string>();
  private reasoningOrder: string[] = [];
  private toolCalls = new Map<string, PartialToolCall>();
  private toolCallOrder: string[] = [];
  private finalResponse: CompletionResponse<RawResponse> | undefined;
  private messageId: string | undefined;

  accept(event: CompletionStreamEvent<RawResponse>): AgentDeltaEvent | undefined {
    if (event.type === "text_delta") {
      this.text += event.delta;
      return { type: "text_delta", delta: event.delta };
    }

    if (event.type === "reasoning_delta") {
      const key = event.id ?? CompletionStreamAccumulator.defaultReasoningKey;
      if (!this.reasoningTextById.has(key)) {
        this.reasoningOrder.push(key);
        this.reasoningTextById.set(key, "");
      }
      this.reasoningTextById.set(key, `${this.reasoningTextById.get(key) ?? ""}${event.delta}`);
      return event.id === undefined
        ? { type: "reasoning_delta", delta: event.delta }
        : { type: "reasoning_delta", delta: event.delta, id: event.id };
    }

    if (event.type === "tool_call_delta") {
      const existing = this.toolCalls.get(event.id);
      const toolCall = existing ?? {
        id: event.id,
        name: "",
        argumentsText: "",
      };
      if (!existing) {
        this.toolCallOrder.push(event.id);
      }
      if (event.callId !== undefined) toolCall.callId = event.callId;
      if (event.name !== undefined) toolCall.name = event.name;
      if (event.argumentsDelta !== undefined) {
        toolCall.argumentsText += event.argumentsDelta;
      }
      this.toolCalls.set(event.id, toolCall);
      return undefined;
    }

    if (event.type === "tool_call") {
      this.upsertToolCall(event.toolCall);
      return undefined;
    }

    if (event.type === "message_id") {
      this.messageId = event.id;
      return undefined;
    }

    if (event.type === "final") {
      this.finalResponse = event.response;
      return undefined;
    }

    return undefined;
  }

  response(): CompletionResponse<RawResponse> {
    if (this.finalResponse !== undefined) {
      if (this.finalResponse.choice.length === 0) {
        const response = {
          ...this.buildAccumulatedResponse(),
          usage: this.finalResponse.usage,
          rawResponse: this.finalResponse.rawResponse,
        };
        if (this.finalResponse.messageId !== undefined) {
          response.messageId = this.finalResponse.messageId;
        }
        return response;
      }
      return this.finalResponse;
    }

    return this.buildAccumulatedResponse();
  }

  private buildAccumulatedResponse(): CompletionResponse<RawResponse> {
    const choice: AssistantContentType[] = [];
    if (this.text.length > 0) {
      choice.push({ type: "text", text: this.text });
    }
    for (const key of this.reasoningOrder) {
      const text = this.reasoningTextById.get(key) ?? "";
      const id = key === CompletionStreamAccumulator.defaultReasoningKey ? undefined : key;
      choice.push(id === undefined ? { type: "reasoning", text } : { type: "reasoning", text, id });
    }
    for (const id of this.toolCallOrder) {
      const toolCall = this.toolCalls.get(id);
      if (toolCall !== undefined) {
        const content: ToolCall = {
          type: "tool_call",
          id: toolCall.id,
          function: {
            name: toolCall.name,
            arguments: parseJsonValue(toolCall.argumentsText),
          },
        };
        if (toolCall.callId !== undefined) {
          content.callId = toolCall.callId;
        }
        choice.push(content);
      }
    }

    const response: CompletionResponse<RawResponse> = {
      choice,
      usage: Usage.empty(),
      rawResponse: undefined as RawResponse,
    };
    if (this.messageId !== undefined) {
      response.messageId = this.messageId;
    }
    return response;
  }

  private upsertToolCall(toolCall: ToolCall): void {
    if (!this.toolCalls.has(toolCall.id)) {
      this.toolCallOrder.push(toolCall.id);
    }
    const partial: PartialToolCall = {
      id: toolCall.id,
      name: toolCall.function.name,
      argumentsText: JSON.stringify(toolCall.function.arguments ?? {}),
    };
    if (toolCall.callId !== undefined) {
      partial.callId = toolCall.callId;
    }
    this.toolCalls.set(toolCall.id, partial);
  }
}
