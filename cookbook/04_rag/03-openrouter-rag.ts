import { AgentBuilder } from "@deltakit/aion/agent";
import { embedDocuments } from "@deltakit/aion/embeddings";
import { InMemoryVectorStore } from "@deltakit/aion/vector-store";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { createTransformersEmbeddingModel } from "@deltakit/aion-transformers";

type PolicyNote = {
  id: string;
  text: string;
};

const client = OpenRouterClient.fromEnv();
const embeddingModel = await createTransformersEmbeddingModel();
const notes: PolicyNote[] = [
  {
    id: "refunds",
    text: "Refund requests over 30 days require manager approval.",
  },
  {
    id: "security",
    text: "Security incidents must be escalated to the incident commander.",
  },
];

const embedded = await embedDocuments(embeddingModel, notes, {
  id: (note) => note.id,
  content: (note) => note.text,
});
const index = InMemoryVectorStore.fromDocuments(embedded).index(embeddingModel);

const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("agent", agentModel)
  .instructions("Answer using the retrieved policy context. If context is thin, say so.")
  .dynamicContext(index, { topK: 1 })
  .build();

const response = await agent.prompt("What should I do for a security incident?").send();

console.log(response.output);
