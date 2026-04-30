import { AgentBuilder } from "@deltakit/aion/agent";
import { Message } from "@deltakit/aion/completion";
import { OpenRouterClient } from "@deltakit/aion/providers";

const client = OpenRouterClient.fromEnv();
const agentModel = client.completionModel("deepseek/deepseek-v4-pro");

const agent = new AgentBuilder("agent", agentModel)
  .instructions("You are a concise assistant that respects prior conversation context.")
  .build();

// History is supplied per request, so the same agent can serve many conversations.
const history = [
  Message.user("My project is named Aion."),
  Message.assistant("Noted. Your project is named Aion."),
];

const response = await agent.prompt("What is my project named?").withHistory(history).send();

console.log(response.output);
