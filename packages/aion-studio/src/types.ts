import type {
  Agent,
  AgentStreamEvent,
  AgentTraceInfo,
  AgentTraceOptions,
  JsonObject,
  JsonValue,
  Message,
  PromptResponse,
  ToolApprovalDecision,
  ToolApprovalStatus,
  Usage,
} from "@deltakit/aion";
import type { Hono } from "hono";

export type StudioCapability =
  | "agents"
  | "approvals"
  | "observability"
  | "sessions"
  | "memory"
  | "knowledge"
  | "traces"
  | "metrics"
  | "evals";

export type StudioAgent = {
  id: string;
  agent: Agent;
  name?: string;
  description?: string;
  quickPrompts?: string[];
  metadata?: JsonObject;
};

export type StudioAgentConfig = {
  id: string;
  name?: string;
  description?: string;
  quickPrompts: string[];
  metadata?: JsonObject;
};

export type StudioCapabilityConfig = {
  enabled: boolean;
  reason?: string;
};

export type StudioConfig = {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  agents: StudioAgentConfig[];
  chat: {
    quickPrompts: Record<string, string[]>;
  };
  capabilities: Partial<Record<StudioCapability, StudioCapabilityConfig>>;
  unsupportedCapabilities: StudioCapability[];
};

export type StudioTranscriptChatEntry = {
  entryId: number;
  kind: "message";
  role: "user" | "assistant";
  text: string;
  traceId?: string;
};

export type StudioTranscriptReasoningEntry = {
  entryId: number;
  kind: "reasoning";
  reasoningId?: string;
  text: string;
};

export type StudioTranscriptToolEntry = {
  entryId: number;
  kind: "tool";
  toolName: string;
  callId?: string;
  args?: string;
  result?: string;
  approval?: StudioToolApprovalTranscript;
};

export type StudioTranscriptEntry =
  | StudioTranscriptChatEntry
  | StudioTranscriptReasoningEntry
  | StudioTranscriptToolEntry;

export type StudioSessionSummary = {
  id: string;
  agentId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  metadata?: JsonObject;
};

export type StudioSession = StudioSessionSummary & {
  messages: Message[];
  transcript: StudioTranscriptEntry[];
};

export type StudioSessionCreateInput = {
  id: string;
  agentId: string;
  title?: string;
  metadata?: JsonObject;
};

export type StudioSessionListOptions = {
  agentId?: string;
  limit: number;
};

export type StudioSessionAppendInput = {
  id: string;
  title?: string;
  messages: Message[];
  transcript: StudioTranscriptEntry[];
};

export type StudioSessionStore = {
  readonly kind?: string;
  listSessions(
    options: StudioSessionListOptions,
  ): StudioSessionSummary[] | Promise<StudioSessionSummary[]>;
  createSession(
    input: StudioSessionCreateInput,
  ): StudioSessionSummary | Promise<StudioSessionSummary>;
  getSession(id: string): StudioSession | undefined | Promise<StudioSession | undefined>;
  appendSessionRun(
    input: StudioSessionAppendInput,
  ): StudioSession | undefined | Promise<StudioSession | undefined>;
  deleteSession?(id: string): boolean | Promise<boolean>;
};

export type StudioTraceStatus = "running" | "success" | "error";

export type StudioTraceObservationKind = "generation" | "tool";

export type StudioTraceObservation = {
  id: string;
  kind: StudioTraceObservationKind;
  name: string;
  status: StudioTraceStatus;
  turn: number;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  input?: JsonValue;
  output?: JsonValue;
  error?: JsonValue;
  metadata?: JsonObject;
};

export type StudioTraceSummary = {
  id: string;
  sessionId: string;
  name?: string;
  status: StudioTraceStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  output?: string;
  error?: JsonValue;
  usage?: Usage;
  metadata?: JsonObject;
  observationCount: number;
};

export type StudioTrace = StudioTraceSummary & {
  trace?: AgentTraceInfo;
  input?: JsonValue;
  observations: StudioTraceObservation[];
};

export type StudioTraceListOptions = {
  limit: number;
  agentId?: string;
  sessionId?: string;
  status?: StudioTraceStatus;
};

export type StudioSessionTraceListOptions = {
  sessionId: string;
  limit: number;
};

export type StudioTraceStore = {
  readonly kind?: string;
  listTraces?(
    options: StudioTraceListOptions,
  ): StudioTraceSummary[] | Promise<StudioTraceSummary[]>;
  listSessionTraces(
    options: StudioSessionTraceListOptions,
  ): StudioTraceSummary[] | Promise<StudioTraceSummary[]>;
  getTrace(id: string): StudioTrace | undefined | Promise<StudioTrace | undefined>;
  saveTrace(trace: StudioTrace): StudioTrace | Promise<StudioTrace>;
};

export type StudioMemoryStore = {
  readonly kind?: string;
};

export type StudioKnowledgeStore = {
  readonly kind?: string;
};

export type StudioStores = {
  sessions?: StudioSessionStore | false;
  traces?: StudioTraceStore;
  memory?: StudioMemoryStore;
  knowledge?: StudioKnowledgeStore;
};

export type StudioUiOptions = {
  path?: string;
  rootRoutes?: boolean;
  title?: string;
  redirectRoot?: boolean;
  clientScript?: string;
  protectShell?: boolean;
};

export type StudioOptions = {
  quickPrompts?: Record<string, string[]>;
};

export type StudioServeOptions = {
  port?: number;
  hostname?: string;
  log?: boolean;
};

export type StudioToolApprovalDecision = ToolApprovalDecision;

export type StudioToolApprovalStatus = ToolApprovalStatus;

export type StudioToolApproval = {
  id: string;
  runId: string;
  agentId: string;
  sessionId?: string;
  toolName: string;
  callId?: string;
  internalCallId: string;
  args: string;
  status: StudioToolApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  reason?: string;
};

export type StudioToolApprovalTranscript = {
  id: string;
  status: StudioToolApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  reason?: string;
};

export type StudioToolApprovalRequestEvent = {
  type: "tool_approval_request";
  approval: StudioToolApproval;
};

export type StudioToolApprovalResultEvent = {
  type: "tool_approval_result";
  approval: StudioToolApproval;
};

export type AgentRunRequest = {
  message: string | Message;
  history?: Message[];
  sessionId?: string;
  stream?: boolean;
  maxTurns?: number;
  toolConcurrency?: number;
  metadata?: JsonObject;
  trace?: AgentTraceOptions;
};

export type AgentRunResponse = PromptResponse;

export type AgentRunStreamEvent =
  | AgentStreamEvent
  | StudioToolApprovalRequestEvent
  | StudioToolApprovalResultEvent;

export type StudioErrorCode =
  | "bad_request"
  | "conflict"
  | "not_found"
  | "unsupported_capability"
  | "internal_error";

export type StudioErrorResponse = {
  error: {
    code: StudioErrorCode;
    message: string;
    details?: JsonValue;
  };
};

export type AionStudio = {
  readonly app: Hono;
  fetch(request: Request): Response | Promise<Response>;
  config(): StudioConfig;
  close(): void;
};
