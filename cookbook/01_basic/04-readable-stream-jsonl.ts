import { AgentBuilder } from "@deltakit/aion/agent";
import { OpenRouterClient } from "@deltakit/aion/providers";

const client = OpenRouterClient.fromEnv();
const agentModel = client.completionModel("deepseek/deepseek-v4-pro");

const agent = new AgentBuilder("agent", agentModel)
  .instructions("You are a concise assistant.")
  .build();

// readableStream() is useful when forwarding agent events from a web server.
const stream = agent
  .prompt("Give three short reasons to use AsyncIterable for streaming.")
  .readableStream();

const reader = stream.getReader();
const decoder = new TextDecoder();

while (true) {
  const result = await reader.read();
  if (result.done) {
    break;
  }

  process.stdout.write(decoder.decode(result.value));
}
