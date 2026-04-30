import { AgentBuilder } from "@deltakit/aion/agent";
import { createTool } from "@deltakit/aion/tool";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { Studio } from "@deltakit/aion-studio";
import { z } from "zod";

const client = OpenRouterClient.fromEnv();

const getIncident = createTool({
  name: "get_incident",
  description: "Read an incident summary from local application state.",
  input: z.object({
    id: z.string().describe("The incident id."),
  }),
  output: z.object({
    id: z.string(),
    customer: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    summary: z.string(),
  }),
  execute: ({ id }) => ({
    id,
    customer: "Acme Co.",
    severity: "high" as const,
    summary: "Webhook retries fail for payloads larger than 512 KB.",
  }),
});

const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("persistent-incident-triage", agentModel)
  .name("Persistent Incident Triage")
  .description("Uses Studio's default persisted sessions and traces for incident triage.")
  .instructions("Use incident tools for private data. Keep answers concise.")
  .tool(getIncident)
  .defaultMaxTurns(2)
  .build();

new Studio([agent], {
  quickPrompts: {
    "persistent-incident-triage": ["Summarize INC-1001 and include the customer impact."],
  },
}).start();
