import { AgentBuilder } from "@deltakit/aion/agent";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { z } from "zod";

// outputSchema asks the model to answer with data matching this schema.
const summarySchema = z
  .object({
    title: z.string(),
    bullets: z.array(z.string()).min(2).max(4),
  })
  .meta({ title: "summary_response" });

const client = OpenRouterClient.fromEnv();
const agentModel = client.completionModel("deepseek/deepseek-v4-pro");

const agent = new AgentBuilder("agent", agentModel)
  .instructions("Return only data that matches the requested schema.")
  .outputSchema(summarySchema)
  .build();

const response = await agent
  .prompt("Summarize why tool calling is useful for agent frameworks.")
  .send();

console.log(response.output);
