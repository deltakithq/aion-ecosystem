import { AgentBuilder } from "@deltakit/aion/agent";
import { createTool } from "@deltakit/aion/tool";
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

const enableMathTools = process.env.ENABLE_MATH_TOOLS !== "false";

const client = OpenRouterClient.fromEnv();
const builderModel = client.completionModel("deepseek/deepseek-v4-pro");
const builder = new AgentBuilder("builder", builderModel)
  .instructions("You are a concise assistant. Use tools only when they are available.")
  .defaultMaxTurns(2);

// Builders are mutable until build(), so application config can decide available tools.
if (enableMathTools) {
  builder.tool(addTool);
}

const agent = builder.build();
const prompt = enableMathTools
  ? "What is 18 + 24? Use the add tool."
  : "Are arithmetic tools available in this run?";

const response = await agent.prompt(prompt).send();

console.log("math tools enabled:", enableMathTools);
console.log(response.output);
