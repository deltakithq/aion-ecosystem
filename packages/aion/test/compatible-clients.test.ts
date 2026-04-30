import { describe, expect, it } from "vitest";
import {
  AnthropicCompatibleClient,
  AnthropicCompatibleCompletionModel,
  Message,
  OpenAICompatibleClient,
  OpenAICompatibleCompletionModel,
} from "../src/index";

describe("compatible provider clients", () => {
  it("creates OpenAI-compatible chat completion models", async () => {
    const calls: unknown[] = [];
    const client = {
      chat: {
        completions: {
          create: async (params: unknown) => {
            calls.push(params);
            return {
              choices: [{ message: { role: "assistant", content: "ok" } }],
              usage: {},
            };
          },
        },
      },
    };

    const compatible = new OpenAICompatibleClient({
      client: client as never,
      model: "custom-chat-model",
    });
    const model = compatible.completionModel();

    expect(model).toBeInstanceOf(OpenAICompatibleCompletionModel);
    await model.completion({
      chatHistory: [Message.user("hello")],
      documents: [],
      tools: [],
    });
    expect(calls).toEqual([
      {
        model: "custom-chat-model",
        messages: [{ role: "user", content: "hello" }],
      },
    ]);
  });

  it("requires OpenAI-compatible model when no default is configured", () => {
    const compatible = new OpenAICompatibleClient({
      client: { chat: { completions: { create: async () => ({ choices: [] }) } } } as never,
    });

    expect(() => compatible.completionModel()).toThrow("Missing OpenAI-compatible model");
  });

  it("requires OpenAI-compatible base URL when constructing an SDK client", () => {
    expect(() => new OpenAICompatibleClient({ model: "custom-chat-model" })).toThrow(
      "Missing OpenAI-compatible base URL",
    );
  });

  it("creates Anthropic-compatible Messages models", async () => {
    const calls: unknown[] = [];
    const client = {
      messages: {
        create: async (params: unknown) => {
          calls.push(params);
          return {
            id: "msg_1",
            content: [{ type: "text", text: "ok" }],
            usage: {},
          };
        },
      },
    };

    const compatible = new AnthropicCompatibleClient({
      client: client as never,
      model: "custom-messages-model",
    });
    const model = compatible.completionModel();

    expect(model).toBeInstanceOf(AnthropicCompatibleCompletionModel);
    await model.completion({
      chatHistory: [Message.user("hello")],
      documents: [],
      tools: [],
    });
    expect(calls).toEqual([
      {
        model: "custom-messages-model",
        max_tokens: 1024,
        messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      },
    ]);
  });

  it("requires Anthropic-compatible model when no default is configured", () => {
    const compatible = new AnthropicCompatibleClient({
      client: { messages: { create: async () => ({ content: [] }) } } as never,
    });

    expect(() => compatible.completionModel()).toThrow("Missing Anthropic-compatible model");
  });

  it("requires Anthropic-compatible base URL when constructing an SDK client", () => {
    expect(() => new AnthropicCompatibleClient({ model: "custom-messages-model" })).toThrow(
      "Missing Anthropic-compatible base URL",
    );
  });
});
