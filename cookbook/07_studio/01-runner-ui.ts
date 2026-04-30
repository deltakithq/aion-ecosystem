import { AgentBuilder } from "@deltakit/aion/agent";
import { createTool } from "@deltakit/aion/tool";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { Studio } from "@deltakit/aion-studio";
import { z } from "zod";

const client = OpenRouterClient.fromEnv();

const getOrder = createTool({
  name: "get_order",
  description: "Read an order summary from local application state.",
  input: z.object({
    id: z.string().describe("The order id to read."),
  }),
  output: z.object({
    id: z.string(),
    status: z.enum(["processing", "blocked", "shipped"]),
    customer: z.string(),
    notes: z.string(),
  }),
  execute: ({ id }) => ({
    id,
    status: "blocked" as const,
    customer: "Delta Kit Labs",
    notes: "Payment review is complete, but warehouse allocation has not been confirmed.",
  }),
});

const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("support-operations", agentModel)
  .name("Support Operations")
  .description("Answers operational questions with short, concrete summaries.")
  .instructions("Use tools when useful. Keep answers concise and action-oriented.")
  .tool(getOrder)
  .defaultMaxTurns(50)
  .build();

new Studio([agent]).start();
