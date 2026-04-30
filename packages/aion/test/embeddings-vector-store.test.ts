import { describe, expect, it } from "vitest";
import {
  AgentBuilder,
  AssistantContent,
  angularDistance,
  type CompletionModel,
  type CompletionRequest,
  type CompletionResponse,
  type CompletionStreamEvent,
  chebyshevDistance,
  cosineSimilarity,
  dotProduct,
  type Embedding,
  type EmbeddingModel,
  embedDocuments,
  embedText,
  embedTexts,
  euclideanDistance,
  InMemoryVectorStore,
  manhattanDistance,
  OpenAIClient,
  OpenAICompatibleClient,
  OpenRouterClient,
  type StreamingCompletionModel,
  Usage,
  vectorFilter,
} from "../src/index";

class KeywordEmbeddingModel implements EmbeddingModel {
  readonly maxBatchSize: number;
  readonly calls: string[][] = [];

  constructor(maxBatchSize = 10) {
    this.maxBatchSize = maxBatchSize;
  }

  async embedTexts(texts: string[]): Promise<Embedding[]> {
    this.calls.push(texts);
    return texts.map((document) => ({ document, vector: vectorFor(document) }));
  }
}

class QueueModel implements CompletionModel {
  readonly requests: CompletionRequest[] = [];

  async completion(request: CompletionRequest): Promise<CompletionResponse> {
    this.requests.push(request);
    return {
      choice: [AssistantContent.text("ok")],
      usage: Usage.empty(),
      rawResponse: {},
    };
  }
}

class StreamingQueueModel extends QueueModel implements StreamingCompletionModel {
  async *streamCompletion(request: CompletionRequest): AsyncIterable<CompletionStreamEvent> {
    this.requests.push(request);
    yield {
      type: "final",
      response: {
        choice: [AssistantContent.text("ok")],
        usage: Usage.empty(),
        rawResponse: {},
      },
    };
  }
}

describe("embeddings", () => {
  it("embeds text and batches text arrays", async () => {
    const model = new KeywordEmbeddingModel(2);

    await expect(embedText(model, "cat")).resolves.toEqual({
      document: "cat",
      vector: [1, 0, 0],
    });
    await expect(embedTexts(model, ["cat", "dog", "risk"])).resolves.toHaveLength(3);
    expect(model.calls).toEqual([["cat"], ["cat", "dog"], ["risk"]]);
  });

  it("embeds typed documents with selectors and metadata", async () => {
    const model = new KeywordEmbeddingModel(2);
    const docs = [
      { id: "a", title: "Cats", body: ["cat", "pet"] },
      { id: "b", title: "Dogs", body: ["dog"] },
    ];

    const embedded = await embedDocuments(model, docs, {
      id: (doc) => doc.id,
      content: (doc) => doc.body,
      metadata: (doc) => ({ title: doc.title }),
      concurrency: 2,
    });

    expect(embedded).toMatchObject([
      {
        id: "a",
        metadata: { title: "Cats" },
        embeddings: [{ document: "cat" }, { document: "pet" }],
      },
      { id: "b", metadata: { title: "Dogs" }, embeddings: [{ document: "dog" }] },
    ]);
  });

  it("computes vector distances", () => {
    expect(dotProduct([1, 2, 3], [1, 5, 7])).toBe(32);
    expect(cosineSimilarity([1, 2, 3], [1, 5, 7])).toBeCloseTo(0.9875414397);
    expect(angularDistance([1, 2, 3], [1, 5, 7])).toBeCloseTo(0.0502980301);
    expect(euclideanDistance([1, 2, 3], [1, 5, 7])).toBe(5);
    expect(manhattanDistance([1, 2, 3], [1, 5, 7])).toBe(7);
    expect(chebyshevDistance([1, 2, 3], [1, 5, 7])).toBe(4);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("provider embedding models", () => {
  it("maps OpenAI embedding requests", async () => {
    const client = mockOpenAIClient();
    const model = new OpenAIClient({ client: client as never }).embeddingModel("embed-a", {
      dimensions: 3,
      user: "u1",
    });

    await expect(model.embedTexts(["a", "b"])).resolves.toHaveLength(2);
    expect(client.embeddings.createCalls[0]).toMatchObject({
      model: "embed-a",
      input: ["a", "b"],
      dimensions: 3,
      user: "u1",
    });
  });

  it("maps OpenAI-compatible and OpenRouter embedding requests", async () => {
    const compatibleClient = mockOpenAIClient();
    const routerClient = mockOpenAIClient();

    await new OpenAICompatibleClient({ client: compatibleClient as never })
      .embeddingModel("compatible-embed")
      .embedTexts(["hello"]);
    await new OpenRouterClient({ client: routerClient as never })
      .embeddingModel("openrouter/embed")
      .embedTexts(["world"]);

    expect(compatibleClient.embeddings.createCalls[0]).toMatchObject({
      model: "compatible-embed",
      input: ["hello"],
    });
    expect(routerClient.embeddings.createCalls[0]).toMatchObject({
      model: "openrouter/embed",
      input: ["world"],
    });
  });
});

describe("in-memory vector store", () => {
  it("searches by cosine similarity and returns ids", async () => {
    const model = new KeywordEmbeddingModel();
    const embedded = await sampleEmbedded(model);
    const index = InMemoryVectorStore.fromDocuments(embedded).index(model);

    await expect(index.search({ query: "cat", topK: 2 })).resolves.toMatchObject([
      { id: "cat", score: 1, document: { title: "Cat guide" } },
      { id: "risk", document: { title: "Risk memo" } },
    ]);
    await expect(index.searchIds({ query: "cat", topK: 1 })).resolves.toEqual([
      { id: "cat", score: 1 },
    ]);
  });

  it("applies threshold, filters, multiple embeddings, add, get, and replacement", async () => {
    const model = new KeywordEmbeddingModel();
    const store = InMemoryVectorStore.fromDocuments(await sampleEmbedded(model));
    const replacement = await embedDocuments(
      model,
      [{ id: "dog", title: "Dog update", texts: ["dog"] }],
      {
        id: (doc) => doc.id,
        content: (doc) => doc.texts,
        metadata: () => ({ category: "animal", rank: 5 }),
      },
    );
    store.addDocuments(replacement);
    const index = store.index(model);

    expect(store.get("dog")?.document).toEqual({ id: "dog", title: "Dog update", texts: ["dog"] });
    await expect(
      index.search({
        query: "dog",
        topK: 5,
        threshold: 0.9,
        filter: vectorFilter.and(vectorFilter.eq("category", "animal"), vectorFilter.gt("rank", 2)),
      }),
    ).resolves.toMatchObject([{ id: "dog" }]);
  });

  it("supports LSH and vector search tools", async () => {
    const model = new KeywordEmbeddingModel();
    const store = InMemoryVectorStore.fromDocuments(await sampleEmbedded(model), {
      index: { type: "lsh", numTables: 2, numHyperplanes: 4, seed: 7 },
    });
    const index = store.index(model);
    const tool = index.asTool({ name: "search_docs", topK: 1 });

    await expect(index.search({ query: "risk", topK: 1 })).resolves.toMatchObject([{ id: "risk" }]);
    await expect(tool.call({ query: "cat" })).resolves.toMatchObject([{ id: "cat" }]);
    expect(await tool.definition("")).toMatchObject({ name: "search_docs" });
  });
});

describe("agent dynamic context", () => {
  it("injects retrieved context into send requests", async () => {
    const embeddingModel = new KeywordEmbeddingModel();
    const index = InMemoryVectorStore.fromDocuments(await sampleEmbedded(embeddingModel)).index(
      embeddingModel,
    );
    const completionModel = new QueueModel();
    const agent = new AgentBuilder("test-agent", completionModel)
      .context("static context", "static")
      .dynamicContext(index, { topK: 1 })
      .build();

    await agent.prompt("cat").send();

    expect(completionModel.requests[0]?.documents).toMatchObject([
      { id: "static", text: "static context" },
      { id: "cat", text: expect.stringContaining("Cat guide") },
    ]);
  });

  it("injects retrieved context into stream requests", async () => {
    const embeddingModel = new KeywordEmbeddingModel();
    const index = InMemoryVectorStore.fromDocuments(await sampleEmbedded(embeddingModel)).index(
      embeddingModel,
    );
    const completionModel = new StreamingQueueModel();
    const agent = new AgentBuilder("test-agent", completionModel)
      .dynamicContext(index, { topK: 1 })
      .build();

    for await (const _event of agent.prompt("dog").stream()) {
      // exhaust stream
    }

    expect(completionModel.requests[0]?.documents).toMatchObject([
      { id: "dog", text: expect.stringContaining("Dog guide") },
    ]);
  });
});

function vectorFor(text: string): number[] {
  if (text.includes("cat") || text.includes("pet")) {
    return [1, 0, 0];
  }
  if (text.includes("dog")) {
    return [0, 1, 0];
  }
  if (text.includes("risk")) {
    return [0.25, 0, 0.75];
  }
  return [0, 0, 1];
}

async function sampleEmbedded(model: EmbeddingModel) {
  return embedDocuments(
    model,
    [
      { id: "cat", title: "Cat guide", texts: ["cat", "pet"] },
      { id: "dog", title: "Dog guide", texts: ["dog"] },
      { id: "risk", title: "Risk memo", texts: ["risk"] },
    ],
    {
      id: (doc) => doc.id,
      content: (doc) => doc.texts,
      metadata: (doc) => ({
        category: doc.id === "risk" ? "finance" : "animal",
        rank: doc.id === "risk" ? 1 : 3,
      }),
    },
  );
}

function mockOpenAIClient() {
  const createCalls: unknown[] = [];
  return {
    embeddings: {
      createCalls,
      async create(params: { input: string[] }) {
        createCalls.push(params);
        return {
          data: params.input.map((text, index) => ({
            index,
            embedding: vectorFor(text),
          })),
        };
      },
    },
  };
}
