import { describe, expect, it } from "vitest";
import {
  AssistantContent,
  type CompletionRequest,
  fromOpenAIResponse,
  fromOpenAIStreamEvent,
  Message,
  openaiMessageHelpers,
  toOpenAIResponsesParams,
  Usage,
  UserContent,
} from "../src/index";

describe("OpenAI Responses mapping", () => {
  it("maps internal tools and tool outputs to Responses API params", () => {
    const request: CompletionRequest = {
      chatHistory: [
        Message.user("What is 2+5?"),
        Message.assistant([AssistantContent.toolCall("call_1", "add", { x: 2, y: 5 }, "fc_1")]),
        Message.user([
          {
            type: "tool_result",
            id: "call_1",
            callId: "fc_1",
            content: [{ type: "text", text: "7" }],
          },
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

    const params = toOpenAIResponsesParams("gpt-5", request);

    expect(params.model).toBe("gpt-5");
    expect(params.tools).toEqual([
      {
        type: "function",
        name: "add",
        description: "Add numbers",
        parameters: { type: "object" },
      },
    ]);
    expect(params.input).toContainEqual({
      type: "function_call_output",
      call_id: "fc_1",
      output: "7",
    });
  });

  it("prepends normalized static context before chat history", () => {
    const request: CompletionRequest = {
      chatHistory: [Message.system("Use context."), Message.user("What is the owner?")],
      documents: [{ id: "owner", text: "Mira owns launch checklists." }],
      tools: [],
    };

    const params = toOpenAIResponsesParams("gpt-5", request);

    expect(params.input).toEqual([
      { role: "system", content: "Use context." },
      { role: "user", content: "<file id: owner>\nMira owns launch checklists.\n</file>\n" },
      { role: "user", content: "What is the owner?" },
    ]);
  });

  it("maps image and document attachments to Responses input parts", () => {
    expect(
      openaiMessageHelpers.messageToResponsesInput(
        Message.user([
          UserContent.text("Inspect these."),
          UserContent.imageUrl("https://example.com/image.png", { detail: "auto" }),
          UserContent.imageBase64("abc123", "image/png"),
          UserContent.documentUrl("https://example.com/report.pdf", "application/pdf"),
          UserContent.documentBase64("pdf123", "application/pdf", { filename: "report.pdf" }),
          UserContent.documentText("Plain document text."),
        ]),
      ),
    ).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Inspect these." },
          { type: "input_image", image_url: "https://example.com/image.png", detail: "auto" },
          { type: "input_image", image_url: "data:image/png;base64,abc123" },
          { type: "input_file", file_url: "https://example.com/report.pdf" },
          {
            type: "input_file",
            file_data: "data:application/pdf;base64,pdf123",
            filename: "report.pdf",
          },
          { type: "input_text", text: "Plain document text." },
        ],
      },
    ]);
  });

  it("rejects unsupported OpenAI attachment history", () => {
    expect(() =>
      openaiMessageHelpers.messageToResponsesInput(
        Message.user([UserContent.documentBase64("abc123", "text/csv")]),
      ),
    ).toThrow("OpenAI Responses only supports PDF document attachments");

    expect(() =>
      openaiMessageHelpers.messageToResponsesInput(
        Message.assistant([AssistantContent.imageBase64("abc123", "image/png")]),
      ),
    ).toThrow("OpenAI Responses does not support image content in assistant history");
  });

  it("maps Responses function calls back to internal tool calls", () => {
    const response = fromOpenAIResponse({
      id: "resp_1",
      output: [
        {
          type: "function_call",
          id: "item_1",
          call_id: "fc_1",
          name: "add",
          arguments: '{"x":2,"y":5}',
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        input_tokens_details: {
          cached_tokens: 3,
        },
      },
    });

    expect(response.choice).toEqual([
      AssistantContent.toolCall("item_1", "add", { x: 2, y: 5 }, "fc_1"),
    ]);
    expect(response.usage).toEqual({
      ...Usage.empty(),
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cachedInputTokens: 3,
    });
    expect(response.messageId).toBe("resp_1");
  });

  it("exposes helper conversion for assistant function call history", () => {
    expect(
      openaiMessageHelpers.messageToResponsesInput(
        Message.assistant([AssistantContent.toolCall("call_1", "lookup", { query: "x" }, "fc_1")]),
      ),
    ).toEqual([
      {
        type: "function_call",
        id: "call_1",
        call_id: "fc_1",
        name: "lookup",
        arguments: '{"query":"x"}',
      },
    ]);
  });

  it("maps Responses stream events to internal stream events", () => {
    expect(fromOpenAIStreamEvent({ type: "response.output_text.delta", delta: "hi" })).toEqual({
      type: "text_delta",
      delta: "hi",
    });

    expect(
      fromOpenAIStreamEvent({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "call_1",
          call_id: "fc_1",
          name: "lookup",
          arguments: '{"query":"x"}',
        },
      }),
    ).toEqual({
      type: "tool_call",
      toolCall: AssistantContent.toolCall("call_1", "lookup", { query: "x" }, "fc_1"),
    });
  });
});
