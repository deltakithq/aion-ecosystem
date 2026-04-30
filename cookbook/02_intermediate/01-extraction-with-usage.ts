import { ExtractorBuilder } from "@deltakit/aion/extractor";
import { Message } from "@deltakit/aion/completion";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { z } from "zod";

const taskSchema = z.object({
  title: z.string().describe("A short task title."),
  priority: z.enum(["low", "medium", "high"]).describe("The task priority."),
});

const client = OpenRouterClient.fromEnv();
const model = client.completionModel("deepseek/deepseek-v4-pro");

// This extends basic extraction with context, retries, and prior messages.
const extractor = new ExtractorBuilder(model, taskSchema)
  .context("If urgency is explicit, use high priority.")
  .retries(1)
  .build();

const response = await extractor.extractWithHistory(
  "Please fix the production login issue today.",
  [Message.user("We are triaging engineering work.")],
);

console.log(response);
