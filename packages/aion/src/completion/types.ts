export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export type Document = {
  id: string;
  text: string;
  additionalProps?: Record<string, string>;
};

export type Text = {
  type: "text";
  text: string;
};

export type ImageDetail = "auto" | "low" | "high";

export type ImageContent = {
  type: "image";
  source:
    | {
        type: "url";
        url: string;
      }
    | {
        type: "base64";
        data: string;
        mediaType: string;
      };
  detail?: ImageDetail;
};

export type DocumentContent = {
  type: "document";
  source:
    | {
        type: "url";
        url: string;
        mediaType: string;
        filename?: string;
      }
    | {
        type: "base64";
        data: string;
        mediaType: string;
        filename?: string;
      }
    | {
        type: "text";
        text: string;
        mediaType?: string;
        filename?: string;
      };
};

export type Reasoning = {
  type: "reasoning";
  text: string;
  id?: string;
};

export type ToolFunction = {
  name: string;
  arguments: JsonValue;
};

export type ToolCall = {
  type: "tool_call";
  id: string;
  callId?: string;
  function: ToolFunction;
  signature?: string;
  additionalParams?: JsonValue;
};

export type ToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mediaType?: string };

export type ToolResult = {
  type: "tool_result";
  id: string;
  callId?: string;
  content: ToolResultContent[];
};

export type UserContent = Text | ToolResult | ImageContent | DocumentContent;
export type AssistantContent = Text | ToolCall | Reasoning | ImageContent;

export type SystemMessage = {
  role: "system";
  content: string;
};

export type UserMessage = {
  role: "user";
  content: UserContent[];
};

export type AssistantMessage = {
  role: "assistant";
  id?: string;
  content: AssistantContent[];
};

export type Message = SystemMessage | UserMessage | AssistantMessage;

export const UserContent = {
  text(text: string): Text {
    return { type: "text", text };
  },
  imageUrl(url: string, options: { detail?: ImageDetail } = {}): ImageContent {
    const image: ImageContent = { type: "image", source: { type: "url", url } };
    if (options.detail !== undefined) {
      image.detail = options.detail;
    }
    return image;
  },
  imageBase64(
    data: string,
    mediaType: string,
    options: { detail?: ImageDetail } = {},
  ): ImageContent {
    const image: ImageContent = {
      type: "image",
      source: { type: "base64", data, mediaType },
    };
    if (options.detail !== undefined) {
      image.detail = options.detail;
    }
    return image;
  },
  documentUrl(
    url: string,
    mediaType: string,
    options: { filename?: string | undefined } = {},
  ): DocumentContent {
    return {
      type: "document",
      source:
        options.filename === undefined
          ? { type: "url", url, mediaType }
          : { type: "url", url, mediaType, filename: options.filename },
    };
  },
  documentBase64(
    data: string,
    mediaType: string,
    options: { filename?: string | undefined } = {},
  ): DocumentContent {
    return {
      type: "document",
      source:
        options.filename === undefined
          ? { type: "base64", data, mediaType }
          : { type: "base64", data, mediaType, filename: options.filename },
    };
  },
  documentText(text: string): Text {
    return { type: "text", text };
  },
  toolResult(id: string, content: string | ToolResultContent[], callId?: string): ToolResult {
    const normalized =
      typeof content === "string" ? [{ type: "text" as const, text: content }] : content;
    return callId === undefined
      ? { type: "tool_result", id, content: normalized }
      : { type: "tool_result", id, callId, content: normalized };
  },
};

export const AssistantContent = {
  text(text: string): Text {
    return { type: "text", text };
  },
  imageUrl(url: string, options: { detail?: ImageDetail } = {}): ImageContent {
    const image: ImageContent = { type: "image", source: { type: "url", url } };
    if (options.detail !== undefined) {
      image.detail = options.detail;
    }
    return image;
  },
  imageBase64(
    data: string,
    mediaType: string,
    options: { detail?: ImageDetail } = {},
  ): ImageContent {
    const image: ImageContent = {
      type: "image",
      source: { type: "base64", data, mediaType },
    };
    if (options.detail !== undefined) {
      image.detail = options.detail;
    }
    return image;
  },
  reasoning(text: string, id?: string): Reasoning {
    return id === undefined ? { type: "reasoning", text } : { type: "reasoning", text, id };
  },
  toolCall(id: string, name: string, args: JsonValue, callId?: string): ToolCall {
    const base: ToolCall = {
      type: "tool_call",
      id,
      function: {
        name,
        arguments: args,
      },
    };
    return callId === undefined ? base : { ...base, callId };
  },
};

export const Message = {
  system(content: string): Message {
    return { role: "system", content };
  },
  user(content: string | UserContent[]): Message {
    return {
      role: "user",
      content: typeof content === "string" ? [UserContent.text(content)] : content,
    };
  },
  assistant(content: string | AssistantContent[], id?: string): Message {
    const normalized = typeof content === "string" ? [AssistantContent.text(content)] : content;
    return id === undefined
      ? { role: "assistant", content: normalized }
      : { role: "assistant", id, content: normalized };
  },
};

export type ToolChoice =
  | "auto"
  | "required"
  | "none"
  | {
      type: "function";
      name: string;
    };

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: JsonObject;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
};

export const Usage = {
  empty(): Usage {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
  },
  add(left: Usage, right: Usage): Usage {
    return {
      inputTokens: left.inputTokens + right.inputTokens,
      outputTokens: left.outputTokens + right.outputTokens,
      totalTokens: left.totalTokens + right.totalTokens,
      cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
      cacheCreationInputTokens: left.cacheCreationInputTokens + right.cacheCreationInputTokens,
    };
  },
};

export type CompletionRequest = {
  model?: string;
  instructions?: string;
  chatHistory: Message[];
  documents: Document[];
  tools: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  toolChoice?: ToolChoice;
  additionalParams?: JsonValue;
  outputSchema?: JsonObject;
};

export type CompletionResponse<RawResponse = unknown> = {
  choice: AssistantContent[];
  usage: Usage;
  rawResponse: RawResponse;
  messageId?: string;
};

export interface CompletionModel<RawResponse = unknown> {
  completion(request: CompletionRequest): Promise<CompletionResponse<RawResponse>>;
}

export type CompletionStreamEvent<RawResponse = unknown> =
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "reasoning_delta";
      delta: string;
      id?: string;
    }
  | {
      type: "tool_call_delta";
      id: string;
      callId?: string;
      name?: string;
      argumentsDelta?: string;
    }
  | {
      type: "tool_call";
      toolCall: ToolCall;
    }
  | {
      type: "message_id";
      id: string;
    }
  | {
      type: "final";
      response: CompletionResponse<RawResponse>;
    }
  | {
      type: "error";
      error: unknown;
    };

export interface StreamingCompletionModel<RawResponse = unknown>
  extends CompletionModel<RawResponse> {
  streamCompletion(request: CompletionRequest): AsyncIterable<CompletionStreamEvent<RawResponse>>;
}

export function textFromAssistantContent(content: AssistantContent[]): string {
  return content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n");
}
