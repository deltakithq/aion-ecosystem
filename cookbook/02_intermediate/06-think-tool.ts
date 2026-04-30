import { AgentBuilder } from "@deltakit/aion/agent";
import { createThinkTool, createTool } from "@deltakit/aion/tool";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { z } from "zod";

const addTool = createTool({
  name: "add",
  description: "Add two numbers together.",
  input: z.object({
    x: z.number().describe("The first number."),
    y: z.number().describe("The second number."),
  }),
  output: z.number(),
  execute: (args) => args.x + args.y,
});

const thinkTool = createThinkTool();

const client = OpenRouterClient.fromEnv();
const agentModel = client.completionModel("deepseek/deepseek-v4-pro");

// The think tool gives models an explicit scratchpad step before final answers.
const agent = new AgentBuilder("agent", agentModel)
  .instructions("Use the think tool before answering multi-step questions.")
  .tools([thinkTool, addTool])
  .defaultMaxTurns(3)
  .build();

for await (const event of agent
  .prompt("Think through the steps, then calculate 17 + 25 and answer briefly.")
  .stream()) {
  if (event.type === "tool_call") {
    console.log("tool call:", event.toolCall.function.name, event.toolCall.function.arguments);
  }

  if (event.type === "tool_result") {
    console.log("tool result:", event.toolName, event.result);
  }

  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

process.stdout.write("\n");
