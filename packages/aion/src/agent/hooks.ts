import type { CompletionResponse, Message } from "../completion/index";

export type HookAction = { type: "continue" } | { type: "terminate"; reason: string };
export type ToolApprovalRequiredAction = {
  type: "require_approval";
  reason?: string;
  timeoutMs?: number;
  rejectMessage?: string;
  timeoutMessage?: string;
};
export type ToolCallHookAction =
  | { type: "continue" }
  | { type: "skip"; reason: string }
  | { type: "terminate"; reason: string }
  | ToolApprovalRequiredAction;

export type ToolApprovalStatus = "pending" | "approved" | "rejected" | "timed_out";

export type ToolApprovalRequest = {
  id: string;
  toolName: string;
  toolCallId?: string;
  internalCallId: string;
  args: string;
  status: "pending";
  requestedAt: string;
  reason?: string;
};

export type ToolApprovalDecision = {
  approved: boolean;
  reason?: string;
};

export type ToolApprovalResult = Omit<ToolApprovalRequest, "status"> & {
  status: Exclude<ToolApprovalStatus, "pending">;
  resolvedAt: string;
  reason?: string;
};

export type ToolApprovalRequestEvent = {
  type: "tool_approval_request";
  approval: ToolApprovalRequest;
};

export type ToolApprovalResultEvent = {
  type: "tool_approval_result";
  approval: ToolApprovalResult;
};

export type ToolApprovalEvent = ToolApprovalRequestEvent | ToolApprovalResultEvent;

export type ToolApprovalHandler = (
  approval: ToolApprovalRequest,
  action: ToolApprovalRequiredAction,
) => ToolApprovalResult | Promise<ToolApprovalResult>;

export type HookResult = HookAction | undefined;
export type ToolCallHookResult = ToolCallHookAction | undefined;

type HookCallback<Args> = (
  args: Args,
) => HookAction | Promise<HookAction | undefined> | Promise<void> | void;
type ToolCallHookCallback<Args> = (
  args: Args,
) => ToolCallHookAction | Promise<ToolCallHookAction | undefined> | Promise<void> | void;

export type CompletionCallHookArgs = {
  prompt: Message;
  history: Message[];
};

export type CompletionResponseHookArgs<RawResponse = unknown> = {
  prompt: Message;
  response: CompletionResponse<RawResponse>;
};

export type ToolCallHookArgs = {
  toolName: string;
  toolCallId?: string;
  internalCallId: string;
  args: string;
};

export type ToolResultHookArgs = ToolCallHookArgs & {
  result: string;
};

export function createHook<RawResponse = unknown>(
  hook: PromptHook<RawResponse>,
): PromptHook<RawResponse> {
  return hook;
}

export function cancelPrompt(reason: string): HookAction {
  return { type: "terminate", reason };
}

export function skipTool(reason: string): ToolCallHookAction {
  return { type: "skip", reason };
}

export function requireApproval(
  options: Omit<ToolApprovalRequiredAction, "type"> = {},
): ToolApprovalRequiredAction {
  return { type: "require_approval", ...options };
}

export interface PromptHook<RawResponse = unknown> {
  onCompletionCall?: HookCallback<CompletionCallHookArgs>;
  onCompletionResponse?: HookCallback<CompletionResponseHookArgs<RawResponse>>;
  onToolCall?: ToolCallHookCallback<ToolCallHookArgs>;
  onToolResult?: HookCallback<ToolResultHookArgs>;
}
