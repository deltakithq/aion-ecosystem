import type {
  ToolApprovalDecision,
  ToolApprovalHandler,
  ToolApprovalRequest,
  ToolApprovalRequiredAction,
  ToolApprovalResult,
} from "@deltakit/aion";
import type { Context, Hono } from "hono";
import type { AgentRunStreamEvent, StudioToolApproval, StudioToolApprovalStatus } from "../types";
import { errorResponse, isObject, optionalQueryString } from "./shared";

type PendingApproval = StudioToolApproval & {
  status: "pending";
  timeout?: ReturnType<typeof setTimeout>;
  emit?: (event: AgentRunStreamEvent) => void;
  resolve: (decision: ToolApprovalDecision) => void;
};

type ApprovalHookContext = {
  runId: string;
  agentId: string;
  sessionId?: string;
  emit?: (event: AgentRunStreamEvent) => void;
};

export type ApprovalRuntime = {
  approvals: Map<string, PendingApproval | StudioToolApproval>;
  createHandler(context: ApprovalHookContext): ToolApprovalHandler;
  list(options: ApprovalListOptions): StudioToolApproval[];
  decide(id: string, decision: ToolApprovalDecision): "missing" | "resolved" | StudioToolApproval;
};

type ApprovalListOptions = {
  status?: "pending" | "resolved";
  runId?: string;
  agentId?: string;
  sessionId?: string;
};

export function registerApprovalRoutes(app: Hono, approvals: ApprovalRuntime): void {
  app.get("/approvals", (c) => {
    const status = parseApprovalStatus(c.req.query("status"));
    if (status === false) {
      return errorResponse(c, 400, "bad_request", "status must be pending or resolved");
    }

    const options: ApprovalListOptions = {};
    const runId = optionalQueryString(c.req.query("runId"));
    const agentId = optionalQueryString(c.req.query("agentId"));
    const sessionId = optionalQueryString(c.req.query("sessionId"));
    if (status !== undefined) {
      options.status = status;
    }
    if (runId !== undefined) {
      options.runId = runId;
    }
    if (agentId !== undefined) {
      options.agentId = agentId;
    }
    if (sessionId !== undefined) {
      options.sessionId = sessionId;
    }

    return c.json({
      approvals: approvals.list(options),
    });
  });

  app.post("/approvals/:approvalId/decision", async (c) => {
    const body = await parseApprovalDecisionRequest(c);
    if ("error" in body) {
      return body.error;
    }

    const result = approvals.decide(c.req.param("approvalId"), body);
    if (result === "missing") {
      return errorResponse(c, 404, "not_found", "Approval not found");
    }
    if (result === "resolved") {
      return errorResponse(c, 409, "conflict", "Approval is already resolved");
    }
    return c.json(result);
  });
}

function parseApprovalStatus(
  value: string | undefined,
): "pending" | "resolved" | undefined | false {
  const status = optionalQueryString(value);
  if (status === undefined) {
    return undefined;
  }
  return status === "pending" || status === "resolved" ? status : false;
}

async function parseApprovalDecisionRequest(
  c: Context,
): Promise<ToolApprovalDecision | { error: Response }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: errorResponse(c, 400, "bad_request", "Request body must be JSON") };
  }

  if (!isObject(body)) {
    return { error: errorResponse(c, 400, "bad_request", "Request body must be an object") };
  }
  if (typeof body.approved !== "boolean") {
    return { error: errorResponse(c, 400, "bad_request", "approved must be a boolean") };
  }
  if ("reason" in body && typeof body.reason !== "string") {
    return { error: errorResponse(c, 400, "bad_request", "reason must be a string") };
  }

  return {
    approved: body.approved,
    ...(typeof body.reason === "string" && body.reason.trim().length > 0
      ? { reason: body.reason.trim() }
      : {}),
  };
}

export function createApprovalRuntime(): ApprovalRuntime {
  const approvals = new Map<string, PendingApproval | StudioToolApproval>();

  return {
    approvals,
    createHandler(context) {
      return (approval, action) => requestApproval(approvals, context, approval, action);
    },
    list(options) {
      return [...approvals.values()]
        .filter((approval) => {
          if (options.status === "pending" && approval.status !== "pending") {
            return false;
          }
          if (options.status === "resolved" && approval.status === "pending") {
            return false;
          }
          if (options.runId !== undefined && approval.runId !== options.runId) {
            return false;
          }
          if (options.agentId !== undefined && approval.agentId !== options.agentId) {
            return false;
          }
          if (options.sessionId !== undefined && approval.sessionId !== options.sessionId) {
            return false;
          }
          return true;
        })
        .map(publicApproval);
    },
    decide(id, decision) {
      const approval = approvals.get(id);
      if (approval === undefined) {
        return "missing";
      }
      if (!isPendingApproval(approval)) {
        return "resolved";
      }

      const resolved = resolveApproval(approval, decision.approved ? "approved" : "rejected", {
        ...(decision.reason === undefined ? {} : { reason: decision.reason }),
      });
      approvals.set(id, resolved);
      approval.emit?.({ type: "tool_approval_result", approval: resolved });
      approval.resolve(decision);
      return publicApproval(resolved);
    },
  };
}

async function requestApproval(
  approvals: Map<string, PendingApproval | StudioToolApproval>,
  context: ApprovalHookContext,
  request: ToolApprovalRequest,
  action: ToolApprovalRequiredAction,
): Promise<ToolApprovalResult> {
  const approval: PendingApproval = {
    id: request.id,
    runId: context.runId,
    agentId: context.agentId,
    ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
    toolName: request.toolName,
    ...(request.toolCallId === undefined ? {} : { callId: request.toolCallId }),
    internalCallId: request.internalCallId,
    args: request.args,
    status: "pending",
    requestedAt: request.requestedAt,
    ...(request.reason === undefined ? {} : { reason: request.reason }),
    ...(context.emit === undefined ? {} : { emit: context.emit }),
    resolve: () => {},
  };

  const decision = new Promise<ToolApprovalResult>((resolve) => {
    approval.resolve = (decision) => {
      const current = approvals.get(request.id);
      if (!isPendingApproval(current)) {
        if (current !== undefined) {
          resolve(toolApprovalResult(publicApproval(current), action));
        }
        return;
      }
      const reason = decision.approved
        ? decision.reason
        : (decision.reason ?? action.rejectMessage ?? "Rejected in Aion Studio.");
      const resolved = resolveApproval(current, decision.approved ? "approved" : "rejected", {
        ...(reason === undefined ? {} : { reason }),
      });
      approvals.set(request.id, resolved);
      context.emit?.({ type: "tool_approval_result", approval: resolved });
      resolve(toolApprovalResult(publicApproval(resolved), action));
    };
  });

  const timeoutMs = action.timeoutMs;
  if (timeoutMs !== undefined && timeoutMs > 0) {
    approval.timeout = setTimeout(() => {
      const current = approvals.get(request.id);
      if (!isPendingApproval(current)) {
        return;
      }
      const resolved = resolveApproval(current, "timed_out", {
        reason: action.timeoutMessage ?? "Approval timed out.",
      });
      approvals.set(request.id, resolved);
      context.emit?.({ type: "tool_approval_result", approval: resolved });
      current.resolve({ approved: false, reason: action.timeoutMessage ?? "Approval timed out." });
    }, timeoutMs);
  }

  approvals.set(request.id, approval);
  context.emit?.({ type: "tool_approval_request", approval: publicApproval(approval) });
  return decision;
}

function isPendingApproval(
  approval: PendingApproval | StudioToolApproval | undefined,
): approval is PendingApproval {
  return approval !== undefined && approval.status === "pending" && "resolve" in approval;
}

function resolveApproval(
  approval: PendingApproval | StudioToolApproval,
  status: Exclude<StudioToolApprovalStatus, "pending">,
  options: { reason?: string } = {},
): StudioToolApproval {
  if ("timeout" in approval && approval.timeout !== undefined) {
    clearTimeout(approval.timeout);
  }
  return publicApproval({
    ...approval,
    status,
    resolvedAt: new Date().toISOString(),
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  });
}

function publicApproval(approval: PendingApproval | StudioToolApproval): StudioToolApproval {
  const { emit, resolve, timeout, ...rest } = approval as PendingApproval;
  void emit;
  void resolve;
  void timeout;
  return rest;
}

function toolApprovalResult(
  approval: StudioToolApproval,
  action: ToolApprovalRequiredAction,
): ToolApprovalResult {
  const reason =
    approval.reason ??
    (approval.status === "timed_out"
      ? action.timeoutMessage
      : approval.status === "rejected"
        ? action.rejectMessage
        : undefined);
  return {
    id: approval.id,
    toolName: approval.toolName,
    ...(approval.callId === undefined ? {} : { toolCallId: approval.callId }),
    internalCallId: approval.internalCallId,
    args: approval.args,
    status: approval.status === "pending" ? "rejected" : approval.status,
    requestedAt: approval.requestedAt,
    resolvedAt: approval.resolvedAt ?? new Date().toISOString(),
    ...(reason === undefined ? {} : { reason }),
  };
}
