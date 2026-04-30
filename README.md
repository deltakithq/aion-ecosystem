# Aion

Aion is a TypeScript runtime for building provider-agnostic agents, tool workflows, and structured extraction inside your application code.

It is designed for teams that want more structure than raw model calls, but less framework weight than a full orchestration stack. Provider clients create models. Builders configure behavior. Your application still owns data, permissions, persistence, and side effects.

## Product Shape

Aion gives you a compact set of primitives for production-adjacent AI workflows:

- Build agents with instructions, tools, context, history, streaming, hooks, turn limits, and output schemas.
- Compose reusable pipelines with explicit steps, named parallel branches, agent prompts, extraction, and batched runs.
- Create provider-backed completion and embedding models for OpenAI, OpenAI-compatible APIs, Anthropic, Anthropic-compatible APIs, and OpenRouter.
- Define tools with Zod schemas, runtime validation, optional output validation, and concurrency controls.
- Extract structured data with schema-first extractors built from reusable completion models.
- Stream normalized events or expose newline-delimited JSON through `ReadableStream`.
- Add RAG with local All-MiniLM embeddings, in-memory vector search, metadata filters, dynamic context, and ChromaDB.
- Connect MCP servers, local skills, image inputs, and document/PDF attachments where the provider supports them.
- Observe runs through a generic observer interface, with optional Langfuse tracing.
- Serve agents locally with Aion Studio for chat, traces, sessions, and tool approval workflows.

## When To Choose Aion

Choose Aion when you are building AI features inside a TypeScript product and want provider-agnostic agents, extractors, tools, pipelines, and Studio workflows without giving up control of your application's data, permissions, persistence, and side effects.

Aion is strongest when you need:

- Application-owned agent infrastructure that can move across providers and runtime environments.
- Typed tools and structured extraction with runtime validation.
- Explicit model, agent, extractor, and pipeline boundaries that stay easy to test.
- Local development workflows for trying agents, inspecting traces, managing sessions, and approving tools.
- A cookbook-first path from simple calls to production-adjacent workflows.

Aion is less focused today on one-off raw completion calls, fully visual no-code workflow design, or hiding provider and runtime choices behind a large abstraction layer. The core SDK is designed so hosted execution can build on portable primitives later without changing the ownership model.

## Design Position

Aion sits between provider-first agent SDKs and larger orchestration frameworks such as LangChain.

Provider-first SDKs are convenient when the provider runtime owns the workflow. Large orchestration frameworks are powerful when you need many abstractions for chains, graphs, memory, retrievers, callbacks, and execution policies. Aion keeps the core model smaller: it gives you explicit runtime objects that compose with ordinary TypeScript.

The main boundary is deliberate:

- `client` is provider access: API keys, base URLs, and provider-specific model wiring.
- `completionModel(...)` is a reusable model capability.
- `AgentBuilder` configures agent behavior around a stable runtime `id`.
- `ExtractorBuilder` configures schema-first extraction without a public extractor id.
- `PipelineBuilder` composes application steps, named parallel branches, agents, and extractors into runnable workflows.
- `Agent` identity is stable for Studio, tracing, and multi-agent registration. Optional `name` and `description` remain display metadata.

This keeps common workflows concise while making the important boundaries visible.

## API Shape

```ts
import {
  AgentBuilder,
  ExtractorBuilder,
  OpenRouterClient,
  PipelineBuilder,
} from "@deltakit/aion";

const client = OpenRouterClient.fromEnv();
const model = client.completionModel("qwen/qwen3.6-35b-a3b");

const agent = new AgentBuilder("support", model)
  .instructions("Answer support questions clearly.")
  .build();

const response = await agent.prompt("How do I reset my password?").send();

const extractor = new ExtractorBuilder(model, ticketSchema).build();
const ticket = await extractor.extract(response.output);

const workflow = new PipelineBuilder<string>()
  .step((input) => `Summarize this support ticket:\n\n${input}`)
  .prompt(agent)
  .extract(extractor)
  .build();

const normalizedTicket = await workflow.run(
  "Acme Co. reports checkout failures. Priority is high.",
);
```

## Packages

| Package | Path | Purpose |
| --- | --- | --- |
| `@deltakit/aion` | `packages/aion` | Core runtime for providers, agents, tools, streaming, extraction, RAG primitives, MCP, skills, attachments, and observability. |
| `@deltakit/aion-chroma` | `packages/aion-chroma` | ChromaDB vector store adapter for Aion embeddings and RAG. |
| `@deltakit/aion-langfuse` | `packages/aion-langfuse` | Langfuse tracing adapter for Aion observers. |
| `@deltakit/aion-transformers` | `packages/aion-transformers` | Transformers.js embedding model adapter, defaulting to local All-MiniLM. |
| `@deltakit/aion-studio` | `packages/aion-studio` | HTTP runtime and browser UI for serving agents, sessions, traces, and approvals. |
| `cookbook` | `cookbook` | Runnable examples that document the public learning path. |

## Getting Started

Install dependencies:

```sh
pnpm install
```

Create a local `.env` file for cookbook runs:

```sh
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...
```

Run the first basic text call:

```sh
pnpm cookbook:basic:01
```

Run Studio locally:

```sh
pnpm cookbook:studio:01
```

Start the cookbook ChromaDB service before running the Chroma-backed RAG examples:

```sh
docker compose -f compose.cookbook.yml up -d chromadb
pnpm cookbook:rag:04
pnpm cookbook:rag:05
```

## Cookbook

The cookbook is a product learning path. It starts with a plain text call, then adds history, streaming, tools, extraction, pipelines, RAG, integrations, multi-agent workflows, Studio, and approval flows one concept at a time.

| Level | Focus |
| --- | --- |
| Basic | Text calls, history, streaming, tools, structured extraction, and output schemas. |
| Intermediate | Usage metadata, context, streamed tool events, hooks, persisted history, attachments, and guarded tools. |
| Pipeline | Step transforms, composition, named parallel branches, batching, agents, extraction, and richer workflows. |
| RAG | Local All-MiniLM embeddings, vector search, metadata filters, dynamic context, and ChromaDB. |
| Integrations | MCP tools, local skills, and tracing. |
| Multi-agent | Agents as tools and pipeline-backed parallel specialists. |
| Studio | Served agents, browser sessions, traces, multi-agent runners, and tool approvals. |

Run the default example for a level:

```sh
pnpm cookbook:basic
pnpm cookbook:intermediate
pnpm cookbook:pipeline
pnpm cookbook:rag
pnpm cookbook:integrations
pnpm cookbook:multi-agent
pnpm cookbook:studio
```

Numbered scripts are available for each level when you want to step through the path in order, for example `pnpm cookbook:basic:01`.

## Development

Common commands:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

Package-scoped commands:

```sh
pnpm --filter @deltakit/aion typecheck
pnpm --filter @deltakit/aion test
pnpm --filter @deltakit/aion build

pnpm --filter @deltakit/aion-studio typecheck
pnpm --filter @deltakit/aion-studio test
pnpm --filter @deltakit/aion-studio build

pnpm --filter cookbook typecheck
```

## Repository Layout

```txt
.
├── packages/
│   ├── aion/              # @deltakit/aion
│   ├── aion-chroma/       # @deltakit/aion-chroma
│   ├── aion-langfuse/     # @deltakit/aion-langfuse
│   ├── aion-transformers/ # @deltakit/aion-transformers
│   └── aion-studio/       # @deltakit/aion-studio
├── cookbook/          # runnable examples
├── biome.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Contributing

Keep changes small and covered by the relevant package tests. For API changes, add or update cookbook coverage so the behavior is easy to verify from the command line.

Before opening a change, run:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## License

MIT.
