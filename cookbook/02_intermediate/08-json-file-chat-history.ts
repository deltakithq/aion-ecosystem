import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AgentBuilder, type PromptResponse } from "@deltakit/aion/agent";
import { Message } from "@deltakit/aion/completion";
import { OpenRouterClient } from "@deltakit/aion/providers";

type SavedHistoryRecord = {
  timestamp: string;
  messages: Message[];
};

type LegacySavedHistoryRecord = {
  timestamp: string;
  prompt: string;
  output: string;
};

const historyPath = new URL("../.memory/basic-chat-history.json", import.meta.url);
const prompt = "Remember that my preferred launch checklist owner is Mira, then confirm briefly.";

const client = OpenRouterClient.fromEnv();
const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("agent", agentModel)
  .instructions("Use prior context from chat history when it is relevant.")
  .build();

const history = await buildHistory();
const response = await agent.prompt(prompt).withHistory(history).send();
await saveHistory(response);

console.log(response.output);
console.log("history file:", historyPath.pathname);

async function buildHistory(): Promise<Message[]> {
  // Persisted history is application-owned; Aion only receives the messages you pass in.
  const records = await readRecords();
  return records.slice(-5).flatMap((record) => record.messages);
}

async function saveHistory(response: PromptResponse): Promise<void> {
  const records = await readRecords();
  records.push({
    timestamp: new Date().toISOString(),
    messages: response.messages,
  });
  await mkdir(dirname(historyPath.pathname), { recursive: true });
  await writeFile(historyPath, `${JSON.stringify(records, null, 2)}\n`);
}

async function readRecords(): Promise<SavedHistoryRecord[]> {
  try {
    const records = JSON.parse(await readFile(historyPath, "utf8")) as Array<
      SavedHistoryRecord | LegacySavedHistoryRecord
    >;
    return records.map(normalizeRecord);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function normalizeRecord(
  record: SavedHistoryRecord | LegacySavedHistoryRecord,
): SavedHistoryRecord {
  if ("messages" in record) {
    return record;
  }

  return {
    timestamp: record.timestamp,
    messages: [Message.user(record.prompt), Message.assistant(record.output)],
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
