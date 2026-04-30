import { AgentBuilder } from "@deltakit/aion/agent";
import { embedDocuments } from "@deltakit/aion/embeddings";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { ChromaVectorStore } from "@deltakit/aion-chroma";
import { createTransformersEmbeddingModel } from "@deltakit/aion-transformers";

type Runbook = {
  id: string;
  text: string;
};

const client = OpenRouterClient.fromEnv();
const embeddingModel = await createTransformersEmbeddingModel();
const runbooks: Runbook[] = [
  {
    id: "database-latency",
    text: "For database latency, inspect connection pool saturation and slow queries.",
  },
  {
    id: "queue-backlog",
    text: "For queue backlog, compare producer rate, worker concurrency, and retry volume.",
  },
];

const embedded = await embedDocuments(embeddingModel, runbooks, {
  id: (runbook) => runbook.id,
  content: (runbook) => runbook.text,
});
const store = await ChromaVectorStore.connect<Runbook>({
  collectionName: "aion_runbooks",
});
await store.upsertDocuments(embedded);

const searchRunbooks = store.index(embeddingModel).asTool({
  name: "search_runbooks",
  description: "Search incident runbooks for relevant operational guidance.",
  topK: 2,
});

const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("agent", agentModel)
  .instructions("Use the runbook search tool before answering incident questions.")
  .tools([searchRunbooks])
  .defaultMaxTurns(2)
  .build();

const response = await agent.prompt("The queue is backing up. What should I check?").send();

console.log(response.output);
