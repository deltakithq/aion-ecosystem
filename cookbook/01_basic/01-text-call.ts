import { AgentBuilder } from "@deltakit/aion/agent";
import { OpenRouterClient } from "@deltakit/aion/providers";

const client = OpenRouterClient.fromEnv();

// Provider clients create models; AgentBuilder composes model-independent behavior.
const agentModel = client.completionModel("deepseek/deepseek-v4-pro");

const agent = new AgentBuilder("agent", agentModel)
  .instructions("You are a concise assistant. Answer in two sentences or less.")
  .build();

const response = await agent.prompt("Explain what an agent framework does.").send();

console.log(response.output);
