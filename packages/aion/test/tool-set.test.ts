import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createTool,
  ToolCallError,
  ToolJsonError,
  ToolNotFoundError,
  ToolServer,
  ToolSet,
} from "../src/index";

const addTool = createTool({
  name: "add",
  description: "Add two numbers",
  input: z.object({
    x: z.number(),
    y: z.number(),
  }),
  output: z.number(),
  execute: (args) => args.x + args.y,
});

describe("ToolSet", () => {
  it("registers, defines, and calls tools", async () => {
    const toolSet = ToolSet.fromTools([addTool]);

    await expect(toolSet.getToolDefinitions()).resolves.toEqual([
      {
        name: "add",
        description: "Add two numbers",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          required: ["x", "y"],
          additionalProperties: false,
        },
      },
    ]);
    await expect(toolSet.call("add", JSON.stringify({ x: 2, y: 5 }))).resolves.toBe("7");
  });

  it("throws for missing tools", async () => {
    const toolSet = new ToolSet();

    await expect(toolSet.call("missing", "{}")).rejects.toBeInstanceOf(ToolNotFoundError);
  });

  it("throws for invalid JSON arguments", async () => {
    const toolSet = ToolSet.fromTools([addTool]);

    await expect(toolSet.call("add", "{")).rejects.toBeInstanceOf(ToolJsonError);
  });

  it("serializes string outputs without JSON quotes", async () => {
    const toolSet = ToolSet.fromTools([
      createTool({
        name: "echo",
        description: "Echo",
        input: z.object({}),
        execute: () => "hello",
      }),
    ]);

    await expect(toolSet.call("echo", "{}")).resolves.toBe("hello");
  });

  it("throws tool call errors for invalid Zod input", async () => {
    const toolSet = ToolSet.fromTools([addTool]);

    await expect(toolSet.call("add", JSON.stringify({ x: "2", y: 5 }))).rejects.toBeInstanceOf(
      ToolCallError,
    );
  });

  it("validates output when an output schema is provided", async () => {
    const toolSet = ToolSet.fromTools([
      createTool({
        name: "bad_output",
        description: "Return bad output",
        input: z.object({}),
        output: z.number(),
        execute: () => "not a number" as unknown as number,
      }),
    ]);

    await expect(toolSet.call("bad_output", "{}")).rejects.toBeInstanceOf(ToolCallError);
  });

  it("allows arbitrary output when output schema is omitted", async () => {
    const toolSet = ToolSet.fromTools([
      createTool({
        name: "object_output",
        description: "Return object output",
        input: z.object({}),
        execute: () => ({ ok: true }),
      }),
    ]);

    await expect(toolSet.call("object_output", "{}")).resolves.toBe('{"ok":true}');
  });

  it("advertises appended tool sets without duplicate definitions", async () => {
    const handle = new ToolServer().tool(addTool).tool(addTool).run();
    const echoTool = createTool({
      name: "echo",
      description: "Echo",
      input: z.object({ value: z.string() }),
      output: z.string(),
      execute: ({ value }) => value,
    });

    handle.appendToolSet(ToolSet.fromTools([echoTool]));

    await expect(handle.callTool("echo", JSON.stringify({ value: "ok" }))).resolves.toBe("ok");
    await expect(handle.getToolDefs()).resolves.toEqual([
      expect.objectContaining({ name: "add" }),
      expect.objectContaining({ name: "echo" }),
    ]);
  });
});
