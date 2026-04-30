import { AgentBuilder, createHook } from "@deltakit/aion/agent";
import { createTool } from "@deltakit/aion/tool";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { z } from "zod";

const mathInput = z.object({
  x: z.number(),
  y: z.number(),
});

const addTool = createTool({
  name: "add",
  description: "Add two numbers.",
  input: mathInput,
  output: z.number(),
  execute: (args) => args.x + args.y,
});

const multiplyTool = createTool({
  name: "multiply",
  description: "Multiply two numbers.",
  input: mathInput,
  output: z.number(),
  execute: (args) => args.x * args.y,
});

// Hooks observe or control each completion/tool step.
const hook = createHook({
  onCompletionCall({ prompt }) {
    console.log("completion call:", prompt.role);
  },
  onToolCall({ toolName, args }) {
    console.log("tool call:", toolName, args);
  },
  onToolResult({ toolName, result }) {
    console.log("tool result:", toolName, result);
  },
});

const client = OpenRouterClient.fromEnv();
const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("agent", agentModel)
  .instructions("Use tools for arithmetic and then explain the result briefly.")
  .tools([addTool, multiplyTool])
  .hook(hook)
  .defaultMaxTurns(2)
  .build();

const response = await agent
  .prompt("Calculate 3 + 9 and 7 * 6. Use both tools before answering.")
  // Independent tool calls can run concurrently.
  .withToolConcurrency(2)
  .send();

console.log(response.output);
