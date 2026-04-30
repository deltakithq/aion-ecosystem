import type { OpenAI } from "openai";
import {
  AssistantContent,
  type AssistantContent as AssistantContentType,
  type CompletionRequest,
  type CompletionResponse,
  type CompletionStreamEvent,
  type DocumentContent,
  type ImageContent,
  type Message as MessageType,
  type StreamingCompletionModel,
  type ToolChoice,
  type ToolDefinition,
  Usage,
  type UserContent,
} from "../../completion/index";
import { orderedRequestMessages } from "../request-messages";
import { isPlainObject, numberFrom, parseJsonValue, schemaName, stringFrom } from "../utils";

type ResponsesCreateParams = Record<string, unknown>;
type ResponsesInputItem = Record<string, unknown>;

export class OpenAIResponsesCompletionModel implements StreamingCompletionModel {
  constructor(
    private readonly client: OpenAI,
    private readonly defaultModel = "gpt-5",
  ) {}

  async completion(request: CompletionRequest): Promise<CompletionResponse> {
    const params = toOpenAIResponsesParams(this.defaultModel, request);
    const response = await this.client.responses.create(params as never);
    return fromOpenAIResponse(response);
  }

  async *streamCompletion(request: CompletionRequest): AsyncIterable<CompletionStreamEvent> {
    const params = { ...toOpenAIResponsesParams(this.defaultModel, request), stream: true };
    const stream = await this.client.responses.create(params as never);
    for await (const event of stream as unknown as AsyncIterable<unknown>) {
      const mapped = fromOpenAIStreamEvent(event);
      if (mapped !== undefined) {
        yield mapped;
      }
    }
  }
}

export function toOpenAIResponsesParams(
  defaultModel: string,
  request: CompletionRequest,
): ResponsesCreateParams {
  const params: ResponsesCreateParams = {
    model: request.model ?? defaultModel,
    input: requestMessages(request).flatMap(messageToResponsesInput),
  };

  if (request.instructions !== undefined) {
    params.instructions = request.instructions;
  }

  if (request.tools.length > 0) {
    params.tools = request.tools.map(toolDefinitionToOpenAI);
  }

  if (request.temperature !== undefined) {
    params.temperature = request.temperature;
  }

  if (request.maxTokens !== undefined) {
    params.max_output_tokens = request.maxTokens;
  }

  if (request.toolChoice !== undefined) {
    params.tool_choice = toolChoiceToOpenAI(request.toolChoice);
  }

  if (request.outputSchema !== undefined) {
    params.text = {
      format: {
        type: "json_schema",
        name: schemaName(request.outputSchema),
        strict: true,
        schema: request.outputSchema,
      },
    };
  }

  if (request.additionalParams !== undefined && isPlainObject(request.additionalParams)) {
    Object.assign(params, request.additionalParams);
  }

  return params;
}

function requestMessages(request: CompletionRequest): MessageType[] {
  return orderedRequestMessages(request);
}

export function fromOpenAIResponse(response: unknown): CompletionResponse {
  const raw = response as Record<string, unknown>;
  const output = Array.isArray(raw.output) ? raw.output : [];
  const choice: AssistantContentType[] = [];

  for (const item of output) {
    if (!isPlainObject(item)) {
      continue;
    }

    if (item.type === "message") {
      choice.push(...messageOutputToAssistantContent(item));
    }

    if (item.type === "function_call") {
      const id = typeof item.id === "string" ? item.id : crypto.randomUUID();
      const callId = typeof item.call_id === "string" ? item.call_id : undefined;
      const name = typeof item.name === "string" ? item.name : "";
      const argsText = typeof item.arguments === "string" ? item.arguments : "{}";
      choice.push(AssistantContent.toolCall(id, name, parseJsonValue(argsText), callId));
    }

    if (item.type === "reasoning") {
      const id = typeof item.id === "string" ? item.id : undefined;
      choice.push(AssistantContent.reasoning("", id));
    }
  }

  const usageSource = isPlainObject(raw.usage) ? raw.usage : {};
  const inputTokens = numberFrom(usageSource.input_tokens);
  const outputTokens = numberFrom(usageSource.output_tokens);
  const totalTokens = numberFrom(usageSource.total_tokens) || inputTokens + outputTokens;
  const details = isPlainObject(usageSource.input_tokens_details)
    ? usageSource.input_tokens_details
    : {};

  const result: CompletionResponse = {
    choice,
    usage: {
      ...Usage.empty(),
      inputTokens,
      outputTokens,
      totalTokens,
      cachedInputTokens: numberFrom(details.cached_tokens),
    },
    rawResponse: response,
  };

  if (typeof raw.id === "string") {
    result.messageId = raw.id;
  }

  return result;
}

export function fromOpenAIStreamEvent(event: unknown): CompletionStreamEvent | undefined {
  if (!isPlainObject(event) || typeof event.type !== "string") {
    return undefined;
  }

  if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
    return typeof event.delta === "string" ? { type: "text_delta", delta: event.delta } : undefined;
  }

  if (
    event.type === "response.reasoning_text.delta" ||
    event.type === "response.reasoning_summary_text.delta"
  ) {
    if (typeof event.delta !== "string") {
      return undefined;
    }
    const id = stringFrom(event.item_id);
    return id === undefined
      ? { type: "reasoning_delta", delta: event.delta }
      : { type: "reasoning_delta", delta: event.delta, id };
  }

  if (event.type === "response.output_item.added" && isPlainObject(event.item)) {
    const item = event.item;
    if (item.type === "function_call") {
      return toolCallDelta(
        stringFrom(item.id) ?? stringFrom(event.item_id) ?? crypto.randomUUID(),
        {
          callId: stringFrom(item.call_id),
          name: stringFrom(item.name),
          argumentsDelta: typeof item.arguments === "string" ? item.arguments : undefined,
        },
      );
    }
    if (typeof item.id === "string") {
      return { type: "message_id", id: item.id };
    }
  }

  if (
    event.type === "response.function_call_arguments.delta" ||
    event.type === "response.function_call_arguments.done"
  ) {
    return toolCallDelta(
      stringFrom(event.item_id) ?? stringFrom(event.output_item_id) ?? crypto.randomUUID(),
      {
        argumentsDelta:
          typeof event.delta === "string"
            ? event.delta
            : typeof event.arguments === "string"
              ? event.arguments
              : undefined,
      },
    );
  }

  if (event.type === "response.output_item.done" && isPlainObject(event.item)) {
    const item = event.item;
    if (item.type === "function_call") {
      return {
        type: "tool_call",
        toolCall: AssistantContent.toolCall(
          stringFrom(item.id) ?? crypto.randomUUID(),
          stringFrom(item.name) ?? "",
          parseJsonValue(typeof item.arguments === "string" ? item.arguments : "{}"),
          stringFrom(item.call_id),
        ),
      };
    }
  }

  if (event.type === "response.completed" && isPlainObject(event.response)) {
    return {
      type: "final",
      response: fromOpenAIResponse(event.response),
    };
  }

  if (event.type === "response.error") {
    return { type: "error", error: event.error ?? event };
  }

  return undefined;
}

function messageToResponsesInput(message: MessageType): ResponsesInputItem[] {
  if (message.role === "system") {
    return [
      {
        role: "system",
        content: message.content,
      },
    ];
  }

  if (message.role === "user") {
    const items: ResponsesInputItem[] = [];
    const inputContent: ResponsesInputItem[] = [];

    for (const content of message.content) {
      if (content.type === "tool_result") {
        items.push({
          type: "function_call_output",
          call_id: content.callId ?? content.id,
          output: content.content
            .map((item) => (item.type === "text" ? item.text : item.data))
            .join("\n"),
        });
      } else {
        inputContent.push(...userContentToOpenAIResponsesParts(content));
      }
    }

    if (inputContent.length === 1 && inputContent[0]?.type === "input_text") {
      items.unshift({ role: "user", content: inputContent[0].text });
    } else if (inputContent.length > 0) {
      items.unshift({ role: "user", content: inputContent });
    }

    return items;
  }

  const items: ResponsesInputItem[] = [];
  const text = message.content
    .flatMap((content) => (content.type === "text" ? [content.text] : []))
    .join("\n");
  if (text.length > 0) {
    items.push({ role: "assistant", content: text });
  }

  for (const content of message.content) {
    if (content.type === "tool_call") {
      items.push({
        type: "function_call",
        id: content.id,
        call_id: content.callId ?? content.id,
        name: content.function.name,
        arguments: JSON.stringify(content.function.arguments ?? {}),
      });
    }
    if (content.type === "image") {
      throw new Error("OpenAI Responses does not support image content in assistant history");
    }
  }

  return items;
}

function userContentToOpenAIResponsesParts(content: UserContent): ResponsesInputItem[] {
  if (content.type === "text") {
    return [{ type: "input_text", text: content.text }];
  }

  if (content.type === "image") {
    const part: ResponsesInputItem = { type: "input_image", image_url: imageUrl(content) };
    if (content.detail !== undefined) {
      part.detail = content.detail;
    }
    return [part];
  }

  if (content.type === "document") {
    return [documentToOpenAIResponsesPart(content)];
  }

  return [];
}

function imageUrl(image: ImageContent): string {
  if (image.source.type === "url") {
    return image.source.url;
  }

  return `data:${image.source.mediaType};base64,${image.source.data}`;
}

function documentToOpenAIResponsesPart(document: DocumentContent): ResponsesInputItem {
  if (document.source.type === "text") {
    return { type: "input_text", text: document.source.text };
  }

  if (document.source.mediaType !== "application/pdf") {
    throw new Error(`OpenAI Responses only supports PDF document attachments`);
  }

  if (document.source.type === "url") {
    return { type: "input_file", file_url: document.source.url };
  }

  return {
    type: "input_file",
    file_data: `data:${document.source.mediaType};base64,${document.source.data}`,
    filename: document.source.filename ?? "document.pdf",
  };
}

function toolDefinitionToOpenAI(tool: ToolDefinition): ResponsesInputItem {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function toolChoiceToOpenAI(toolChoice: ToolChoice): unknown {
  if (toolChoice === "auto" || toolChoice === "required" || toolChoice === "none") {
    return toolChoice;
  }

  return {
    type: "function",
    name: toolChoice.name,
  };
}

function messageOutputToAssistantContent(item: Record<string, unknown>): AssistantContentType[] {
  const content = Array.isArray(item.content) ? item.content : [];
  return content.flatMap((part): AssistantContentType[] => {
    if (!isPlainObject(part)) {
      return [];
    }

    if (part.type === "output_text" && typeof part.text === "string") {
      return [AssistantContent.text(part.text)];
    }

    if (part.type === "text" && typeof part.text === "string") {
      return [AssistantContent.text(part.text)];
    }

    return [];
  });
}

function toolCallDelta(
  id: string,
  values: {
    callId?: string | undefined;
    name?: string | undefined;
    argumentsDelta?: string | undefined;
  },
): CompletionStreamEvent {
  const event: CompletionStreamEvent = { type: "tool_call_delta", id };
  if (values.callId !== undefined) event.callId = values.callId;
  if (values.name !== undefined) event.name = values.name;
  if (values.argumentsDelta !== undefined) event.argumentsDelta = values.argumentsDelta;
  return event;
}

export const openaiMessageHelpers = {
  messageToResponsesInput,
  toolDefinitionToOpenAI,
};
