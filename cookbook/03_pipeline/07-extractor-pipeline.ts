import { ExtractorBuilder } from "@deltakit/aion/extractor";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { PipelineBuilder } from "@deltakit/aion/pipeline";
import { z } from "zod";

const client = OpenRouterClient.fromEnv();

const ticketSchema = z.object({
  customer: z.string(),
  issue: z.string(),
  priority: z.enum(["low", "normal", "high"]),
});

const model = client.completionModel("deepseek/deepseek-v4-pro");
const ticketExtractor = new ExtractorBuilder(model, ticketSchema)
  .instructions("Extract a support ticket from the provided operational note.")
  .build();

const ticketPipeline = new PipelineBuilder<string>()
  .step((note) => `Extract a support ticket from this note:\n\n${note}`)
  .extract(ticketExtractor)
  .build();

const ticket = await ticketPipeline.run(
  "Acme Co. reports checkout outage and missed orders after payment retries failed.",
);

console.log(ticket);
