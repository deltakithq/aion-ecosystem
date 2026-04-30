import { describe, expect, it } from "vitest";
import {
  AssistantContent,
  type CompletionRequest,
  fromOpenRouterChatResponse,
  fromOpenRouterChatStreamChunk,
  Message,
  openRouterMessageHelpers,
  toOpenRouterChatParams,
  Usage,
  UserContent,
} from "../src/index";

describe("OpenRouter chat-completions mapping", () => {
  it("maps internal tools and tool outputs to OpenRouter chat params", () => {
    const request: CompletionRequest = {
      chatHistory: [
        Message.user("What is 2+5?"),
        Message.assistant([AssistantContent.toolCall("call_1", "add", { x: 2, y: 5 })]),
        Message.user([
          { type: "tool_result", id: "call_1", content: [{ type: "text", text: "7" }] },
        ]),
      ],
      documents: [],
      tools: [
        {
          name: "add",
          description: "Add numbers",
          parameters: { type: "object" },
        },
      ],
      temperature: 0.2,
      maxTokens: 128,
      toolChoice: "auto",
    };

    const params = toOpenRouterChatParams("openai/gpt-5.2", request);

    expect(params.model).toBe("openai/gpt-5.2");
    expect(params.tools).toEqual([
      {
        type: "function",
        function: {
          name: "add",
          description: "Add numbers",
          parameters: { type: "object" },
        },
      },
    ]);
    expect(params.messages).toContainEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "7",
    });
  });

  it("prepends normalized static context before chat history", () => {
    const request: CompletionRequest = {
      chatHistory: [Message.system("Use context."), Message.user("What is the owner?")],
      documents: [{ id: "owner", text: "Mira owns launch checklists." }],
      tools: [],
    };

    const params = toOpenRouterChatParams("openai/gpt-5.2", request);

    expect(params.messages).toEqual([
      { role: "system", content: "Use context." },
      { role: "user", content: "<file id: owner>\nMira owns launch checklists.\n</file>\n" },
      { role: "user", content: "What is the owner?" },
    ]);
  });

  it("maps image attachments to OpenRouter chat content parts", () => {
    expect(
      openRouterMessageHelpers.messageToChatMessages(
        Message.user([
          UserContent.text("Inspect these."),
          UserContent.imageUrl("https://example.com/image.png", { detail: "auto" }),
          UserContent.imageBase64("abc123", "image/png"),
          UserContent.documentText("Plain document text."),
        ]),
      ),
    ).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Inspect these." },
          {
            type: "image_url",
            image_url: { url: "https://example.com/image.png", detail: "auto" },
          },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
          { type: "text", text: "Plain document text." },
        ],
      },
    ]);
  });

  it("rejects unsupported OpenRouter attachment history", () => {
    expect(() =>
      openRouterMessageHelpers.messageToChatMessages(
        Message.user([UserContent.documentBase64("pdf123", "application/pdf")]),
      ),
    ).toThrow("OpenRouter chat does not support file document attachments");

    expect(() =>
      openRouterMessageHelpers.messageToChatMessages(
        Message.assistant([AssistantContent.imageBase64("abc123", "image/png")]),
      ),
    ).toThrow("OpenRouter chat does not support image content in assistant history");
  });

  it("maps OpenRouter tool calls back to internal tool calls", () => {
    const response = fromOpenRouterChatResponse({
      id: "chatcmpl_1",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "add",
                  arguments: '{"x":2,"y":5}',
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        prompt_tokens_details: {
          cached_tokens: 3,
        },
      },
    });

    expect(response.choice).toEqual([AssistantContent.toolCall("call_1", "add", { x: 2, y: 5 })]);
    expect(response.usage).toEqual({
      ...Usage.empty(),
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cachedInputTokens: 3,
    });
    expect(response.messageId).toBe("chatcmpl_1");
  });

  it("exposes helper conversion for assistant tool-call history", () => {
    expect(
      openRouterMessageHelpers.messageToChatMessages(
        Message.assistant([AssistantContent.toolCall("call_1", "lookup", { query: "x" })]),
      ),
    ).toEqual([
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "lookup",
              arguments: '{"query":"x"}',
            },
          },
        ],
      },
    ]);
  });

  it("maps OpenRouter chat stream chunks to internal stream events", () => {
    expect(
      fromOpenRouterChatStreamChunk({
        id: "chatcmpl_1",
        choices: [
          {
            delta: {
              content: "hi",
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "lookup", arguments: '{"query":"x"}' },
                },
              ],
            },
          },
        ],
      }),
    ).toEqual([
      { type: "text_delta", delta: "hi" },
      {
        type: "tool_call_delta",
        id: "tool_0",
        callId: "call_1",
        name: "lookup",
        argumentsDelta: '{"query":"x"}',
      },
      { type: "message_id", id: "chatcmpl_1" },
    ]);
  });

  it("maps OpenRouter streaming usage chunks to final responses", () => {
    expect(
      fromOpenRouterChatStreamChunk({
        id: "chatcmpl_1",
        choices: [],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
          prompt_tokens_details: {
            cached_tokens: 2,
          },
        },
      }),
    ).toEqual([
      { type: "message_id", id: "chatcmpl_1" },
      {
        type: "final",
        response: {
          choice: [],
          usage: {
            ...Usage.empty(),
            inputTokens: 11,
            outputTokens: 7,
            totalTokens: 18,
            cachedInputTokens: 2,
          },
          rawResponse: {
            id: "chatcmpl_1",
            choices: [],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 7,
              total_tokens: 18,
              prompt_tokens_details: {
                cached_tokens: 2,
              },
            },
          },
          messageId: "chatcmpl_1",
        },
      },
    ]);
  });

  it("uses tool-call index as the stable stream accumulator id", () => {
    expect(
      fromOpenRouterChatStreamChunk({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "get_ticket" },
                },
              ],
            },
          },
        ],
      }),
    ).toEqual([
      {
        type: "tool_call_delta",
        id: "tool_0",
        callId: "call_1",
        name: "get_ticket",
      },
    ]);

    expect(
      fromOpenRouterChatStreamChunk({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"id":"TICKET-1001"}' },
                },
              ],
            },
          },
        ],
      }),
    ).toEqual([
      {
        type: "tool_call_delta",
        id: "tool_0",
        argumentsDelta: '{"id":"TICKET-1001"}',
      },
    ]);
  });
});
