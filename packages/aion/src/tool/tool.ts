import type { JsonValue, ToolDefinition } from "../completion/types";

export interface Tool<Args = unknown, Output = unknown> {
  readonly name: string;
  definition(prompt: string): ToolDefinition | Promise<ToolDefinition>;
  call(args: Args): Output | Promise<Output>;
}

export function serializeToolOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  const serialized = JSON.stringify(output);
  return serialized === undefined ? String(output) : serialized;
}

export function parseToolArgs(args: string): JsonValue {
  if (args.trim() === "") {
    return {};
  }

  return JSON.parse(args) as JsonValue;
}
