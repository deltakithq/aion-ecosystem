import { AgentBuilder } from "@deltakit/aion/agent";
import { connectMcp, mcp } from "@deltakit/aion/mcp";
import { OpenRouterClient } from "@deltakit/aion/providers";

const client = OpenRouterClient.fromEnv();

const counterMcp = await connectMcp(
  mcp.stdio({
    name: "counter",
    command: "tsx",
    args: ["05_integrations/_support/mcp-counter-server.ts"],
  }),
);

try {
  const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
  const agent = new AgentBuilder("agent", agentModel)
    .instructions("Use MCP tools for arithmetic and counter updates.")
    .mcp([counterMcp])
    .defaultMaxTurns(3)
    .build();

  for await (const event of agent
    .prompt("Add 8 and 13, then increment the counter by the result.")
    .stream()) {
    if (event.type === "tool_call") {
      console.log("tool call:", event.toolCall.function.name, event.toolCall.function.arguments);
    }

    if (event.type === "tool_result") {
      console.log("tool result:", event.toolName, event.result);
    }

    if (event.type === "final") {
      console.log("final:", event.output);
    }
  }
} finally {
  await counterMcp.close();
}
