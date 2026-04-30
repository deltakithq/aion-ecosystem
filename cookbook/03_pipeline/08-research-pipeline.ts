import { AgentBuilder } from "@deltakit/aion/agent";
import { createTool, ToolSet } from "@deltakit/aion/tool";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { PipelineBuilder } from "@deltakit/aion/pipeline";
import { z } from "zod";

const client = OpenRouterClient.fromEnv();

const researchTools = ToolSet.fromTools([
  createTool({
    name: "search_notes",
    description: "Return mock search notes for a research topic.",
    input: z.object({
      topic: z.string(),
    }),
    output: z.array(z.string()),
    execute: ({ topic }) => [
      `${topic}: customer teams ask for clearer implementation guidance.`,
      `${topic}: support volume increased after the latest product launch.`,
      `${topic}: engineering notes mention missing examples in docs.`,
    ],
  }),
  createTool({
    name: "source_quality",
    description: "Return mock source quality signals for a research topic.",
    input: z.object({
      topic: z.string(),
    }),
    output: z.object({
      confidence: z.enum(["low", "medium", "high"]),
      caveat: z.string(),
    }),
    execute: () => ({
      confidence: "medium" as const,
      caveat: "Mock data only; verify against real telemetry before making roadmap decisions.",
    }),
  }),
]);

const searchNotes = new PipelineBuilder<string>()
  .step((topic) => researchTools.call("search_notes", JSON.stringify({ topic })))
  .build();

const sourceQuality = new PipelineBuilder<string>()
  .step((topic) => researchTools.call("source_quality", JSON.stringify({ topic })))
  .build();

const synthesizerModel = client.completionModel("deepseek/deepseek-v4-pro");
const synthesizer = new AgentBuilder("synthesizer", synthesizerModel)
  .instructions(
    [
      "You synthesize product research notes.",
      "Separate findings, risks, and recommended next steps.",
      "Call out when evidence is mock or incomplete.",
      "Return visible final text, not only reasoning.",
    ].join("\n"),
  )
  .build();

const researchPipeline = new PipelineBuilder<string>()
  .parallel({
    notesJson: searchNotes,
    qualityJson: sourceQuality,
  })
  .step(({ notesJson, qualityJson }) => {
    const notes = JSON.parse(notesJson) as string[];
    const quality = JSON.parse(qualityJson) as { confidence: string; caveat: string };

    return [
      "Synthesize this research packet.",
      "",
      "Search notes:",
      ...notes.map((note) => `- ${note}`),
      "",
      `Confidence: ${quality.confidence}`,
      `Caveat: ${quality.caveat}`,
    ].join("\n");
  })
  .prompt(synthesizer)
  .build();

const report = await researchPipeline.run("Aion pipeline cookbook examples");

console.log(report);
