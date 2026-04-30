import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AgentBuilder,
  AssistantContent,
  type CompletionRequest,
  type CompletionResponse,
  type CompletionStreamEvent,
  createTool,
  Message,
  type StreamingCompletionModel,
  toReadableStream,
} from "../src/index";

class StreamingQueueModel implements StreamingCompletionModel {
  readonly requests: CompletionRequest[] = [];

  constructor(private readonly responses: CompletionStreamEvent[][]) {}

  async completion(): Promise<CompletionResponse> {
    throw new Error("completion should not be called");
  }

  async *streamCompletion(request: CompletionRequest): AsyncIterable<CompletionStreamEvent> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error("No queued response");
    }
    yield* response;
  }
}

const addTool = createTool({
  name: "add",
  description: "Add numbers",
  input: z.object({
    x: z.number(),
    y: z.number(),
  }),
  output: z.number(),
  execute: (args) => args.x + args.y,
});

describe("PromptRequest streaming", () => {
  it("streams text deltas and final response", async () => {
    const model = new StreamingQueueModel([
      [
        { type: "text_delta", delta: "hel" },
        { type: "text_delta", delta: "lo" },
      ],
    ]);
    const agent = new AgentBuilder("test-agent", model).instructions("system").build();

    const events = await collect(agent.prompt("hi").stream());

    expect(events.map((event) => event.type)).toEqual([
      "turn_start",
      "text_delta",
      "text_delta",
      "turn_end",
      "final",
    ]);
    expect(events.at(-1)).toMatchObject({ type: "final", output: "hello" });
    expect(model.requests[0]?.instructions).toBe("system");
    expect(model.requests[0]?.chatHistory[0]).toEqual(Message.user("hi"));
  });

  it("merges usage-only final stream responses with accumulated text", async () => {
    const model = new StreamingQueueModel([
      [
        { type: "text_delta", delta: "hel" },
        { type: "text_delta", delta: "lo" },
        {
          type: "final",
          response: {
            choice: [],
            usage: {
              inputTokens: 2,
              outputTokens: 1,
              totalTokens: 3,
              cachedInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
            rawResponse: {},
          },
        },
      ],
    ]);
    const agent = new AgentBuilder("test-agent", model).build();

    const events = await collect(agent.prompt("hi").stream());

    expect(events.at(-1)).toMatchObject({
      type: "final",
      output: "hello",
      usage: {
        inputTokens: 2,
        outputTokens: 1,
        totalTokens: 3,
      },
    });
  });

  it("streams automatic tool execution across turns", async () => {
    const model = new StreamingQueueModel([
      [
        {
          type: "tool_call_delta",
          id: "call_1",
          name: "add",
          argumentsDelta: '{"x":2,"y":5}',
        },
      ],
      [{ type: "text_delta", delta: "7" }],
    ]);
    const agent = new AgentBuilder("test-agent", model).tool(addTool).build();

    const events = await collect(agent.prompt("add").stream());

    expect(events).toContainEqual({
      type: "tool_call",
      turn: 1,
      toolCall: AssistantContent.toolCall("call_1", "add", { x: 2, y: 5 }),
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        turn: 1,
        toolName: "add",
        args: '{"x":2,"y":5}',
        result: "7",
      }),
    );
    expect(events.at(-1)).toMatchObject({ type: "final", output: "7" });
    expect(model.requests).toHaveLength(2);
  });

  it("buffers reasoning deltas without ids into one reasoning message", async () => {
    const model = new StreamingQueueModel([
      [
        { type: "reasoning_delta", delta: "Think" },
        { type: "reasoning_delta", delta: " once." },
        { type: "text_delta", delta: "done" },
      ],
    ]);
    const agent = new AgentBuilder("test-agent", model).build();

    const events = await collect(agent.prompt("reason").stream());

    expect(events.at(-1)).toMatchObject({
      type: "final",
      messages: [
        Message.user("reason"),
        Message.assistant([
          AssistantContent.text("done"),
          AssistantContent.reasoning("Think once."),
        ]),
      ],
    });
  });

  it("merges streamed tool-call chunks that use a provider call id", async () => {
    const model = new StreamingQueueModel([
      [
        {
          type: "tool_call_delta",
          id: "tool_0",
          callId: "call_1",
          name: "add",
        },
        {
          type: "tool_call_delta",
          id: "tool_0",
          argumentsDelta: '{"x":2,"y":5}',
        },
      ],
      [{ type: "text_delta", delta: "7" }],
    ]);
    const agent = new AgentBuilder("test-agent", model).tool(addTool).build();

    const events = await collect(agent.prompt("add").stream());

    expect(events).toContainEqual({
      type: "tool_call",
      turn: 1,
      toolCall: {
        ...AssistantContent.toolCall("tool_0", "add", { x: 2, y: 5 }),
        callId: "call_1",
      },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        turn: 1,
        toolName: "add",
        toolCallId: "call_1",
        args: '{"x":2,"y":5}',
        result: "7",
      }),
    );
    expect(model.requests[1]?.chatHistory.at(-1)).toEqual(
      Message.user([
        {
          type: "tool_result",
          id: "tool_0",
          callId: "call_1",
          content: [{ type: "text", text: "7" }],
        },
      ]),
    );
  });

  it("converts stream events to JSONL readable streams", async () => {
    async function* events() {
      yield { type: "text_delta", delta: "a" };
      yield { type: "final", output: "a" };
    }

    const readable = toReadableStream(events());
    const text = await readAll(readable);

    expect(
      text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      { type: "text_delta", delta: "a" },
      { type: "final", output: "a" },
    ]);
  });

  it("emits an error JSON line when readable stream iteration fails", async () => {
    async function* events() {
      yield { type: "text_delta", delta: "a" };
      throw new Error("boom");
    }

    const text = await readAll(toReadableStream(events()));
    const lines = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(lines[0]).toEqual({ type: "text_delta", delta: "a" });
    expect(lines[1]).toMatchObject({ type: "error", error: { message: "boom" } });
  });
});

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
}

async function readAll(readable: ReadableStream<Uint8Array>): Promise<string> {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const result = await reader.read();
    if (result.done) {
      return text;
    }
    text += decoder.decode(result.value, { stream: true });
  }
}
