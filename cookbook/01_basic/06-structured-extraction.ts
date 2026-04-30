import { ExtractorBuilder } from "@deltakit/aion/extractor";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { z } from "zod";

// ExtractorBuilder uses the schema as the shape of the returned data.
const personSchema = z.object({
  firstName: z.string().describe("The person's first name."),
  lastName: z.string().describe("The person's last name."),
  role: z.string().optional().describe("The person's job or role, if mentioned."),
});

const client = OpenRouterClient.fromEnv();
const model = client.completionModel("deepseek/deepseek-v4-pro");
const extractor = new ExtractorBuilder(model, personSchema).build();

const person = await extractor.extract("Ada Lovelace was a mathematician and computing pioneer.");

console.log(person);
