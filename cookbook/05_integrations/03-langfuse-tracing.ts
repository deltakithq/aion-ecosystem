import { AgentBuilder } from "@deltakit/aion/agent";
import { createTool } from "@deltakit/aion/tool";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { langfuse } from "@deltakit/aion-langfuse";
import { z } from "zod";

const client = OpenRouterClient.fromEnv();
const tracing = langfuse.fromEnv();

const getTicket = createTool({
  name: "get_ticket",
  description: "Read a support ticket from local application state.",
  input: z.object({
    id: z.string().describe("The ticket id to read."),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    summary: z.string(),
  }),
  execute: ({ id }) => ({
    id,
    title: "Checkout button disabled after address autocomplete",
    severity: "high" as const,
    summary:
      "Users can select an address, but checkout remains disabled until they reload the page.",
  }),
});

const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("agent", agentModel)
  .instructions("Use tools when useful. Answer with a short engineering-focused summary.")
  .observe(tracing)
  .tools([getTicket])
  .defaultMaxTurns(2)
  .build();

try {
  const response = await agent
    .prompt("Summarize ticket TICKET-1001 for the product engineering team.")
    .withTrace({
      name: "support-ticket-summary",
      userId: "cookbook-user",
      sessionId: "cookbook-session",
      metadata: { ticketId: "TICKET-1001", example: "integrations:03" },
      tags: ["cookbook", "aion"],
    })
    .send();

  console.log(response.output);
  console.log("trace:", response.trace?.traceId ?? "(not available)");
} finally {
  await tracing.shutdown();
}
