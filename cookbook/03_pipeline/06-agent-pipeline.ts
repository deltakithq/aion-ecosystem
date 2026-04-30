import { AgentBuilder } from "@deltakit/aion/agent";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { PipelineBuilder } from "@deltakit/aion/pipeline";

const client = OpenRouterClient.fromEnv();

const analystModel = client.completionModel("deepseek/deepseek-v4-pro");
const analyst = new AgentBuilder("analyst", analystModel)
  .instructions(
    [
      "You turn rough operational notes into a concise executive update.",
      "Use only the facts provided.",
      "Return visible final text, not only reasoning.",
      "Use compact bullets.",
    ].join("\n"),
  )
  .build();

const executiveUpdate = new PipelineBuilder<string[]>()
  .step((notes) => notes.map((note) => `- ${note}`).join("\n"))
  .step((notes) => `Prepare an executive update from these notes:\n\n${notes}`)
  .prompt(analyst)
  .build();

const output = await executiveUpdate.run([
  "Acme Co. missed several webhook retries in the last hour.",
  "Failures only affect payloads larger than 512 KB.",
  "Engineering is checking retry queue limits and delivery logs.",
]);

console.log(output);
