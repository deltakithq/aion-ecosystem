import { AgentBuilder } from "@deltakit/aion/agent";
import { loadSkills, skill } from "@deltakit/aion/skills";
import { OpenRouterClient } from "@deltakit/aion/providers";

const skills = await loadSkills(skill.local(new URL("../skills", import.meta.url).pathname));

const client = OpenRouterClient.fromEnv();
const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("agent", agentModel)
  .instructions(
    [
      "Use skills when they are relevant.",
      "For release note tasks, load the release-notes skill instructions, read its style reference, and run its draft script before answering.",
    ].join("\n"),
  )
  .skills(skills)
  .defaultMaxTurns(4)
  .build();

const prompt =
  "Draft release notes for Aion: added local skills, MCP tools, streaming, and PDF/image attachments.";

for await (const event of agent.prompt(prompt).stream()) {
  if (event.type === "tool_call") {
    console.log("tool call:", event.toolCall.function.name, event.toolCall.function.arguments);
  }

  if (event.type === "tool_result") {
    console.log("tool result:", event.toolName, event.result);
  }

  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }

  if (event.type === "final") {
    process.stdout.write("\n");
  }
}
