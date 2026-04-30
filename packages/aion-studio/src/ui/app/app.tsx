import { ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AgentRunStreamEvent,
  StudioConfig,
  StudioSession,
  StudioSessionSummary,
  StudioTrace,
  StudioTraceSummary,
} from "../../types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./lib/utils";
import { AgentsPage } from "./modules/agents/agents-page";
import { TranscriptItem } from "./modules/playground/transcript-item";
import { DeleteSessionDialog, SessionsPage } from "./modules/sessions/sessions-page";
import {
  errorMessage,
  formatRelativeTime,
  formatToolValue,
  pageTitle,
  titleFromText,
} from "./modules/shared/format";
import {
  logoSrc,
  pageLocationFromLocation,
  updatePagePath,
  updateSessionPath,
  updateTracePath,
} from "./modules/shared/path";
import {
  findMatchingToolIndex,
  findMatchingToolIndexByCall,
  formValue,
  nextPaint,
  nextSequence,
  nextTranscriptId,
  readJsonl,
  resetTranscriptSequence,
  resizeTextarea,
  setTranscriptSequence,
  toHistory,
} from "./modules/shared/transcript";
import type {
  ActivePage,
  RunState,
  SessionLoadState,
  ToolApprovalUpdate,
  TraceLoadState,
  TraceStatusFilter,
  TranscriptEntry,
} from "./modules/shared/types";
import { NavButton } from "./modules/shell/nav-button";
import { TraceBrowser } from "./modules/tracing/trace-browser";

export function StudioConsole() {
  const [config, setConfig] = useState<StudioConfig | undefined>();
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [allSessions, setAllSessions] = useState<StudioSessionSummary[]>([]);
  const [traces, setTraces] = useState<StudioTrace[]>([]);
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [activePage, setActivePage] = useState<ActivePage>(() => pageLocationFromLocation().page);
  const [selectedTraceId, setSelectedTraceId] = useState(
    () => pageLocationFromLocation().traceId ?? "",
  );
  const [traceAgentFilter, setTraceAgentFilter] = useState("all");
  const [traceSessionFilter, setTraceSessionFilter] = useState("all");
  const [traceStatusFilter, setTraceStatusFilter] = useState<TraceStatusFilter>("all");
  const [deleteCandidate, setDeleteCandidate] = useState<StudioSessionSummary | undefined>();
  const [status, setStatus] = useState("Loading");
  const [error, setError] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [decidingApprovals, setDecidingApprovals] = useState<Set<string>>(() => new Set());
  const [sessionLoadState, setSessionLoadState] = useState<SessionLoadState>("idle");
  const [traceLoadState, setTraceLoadState] = useState<TraceLoadState>("idle");
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const loadConfig = useCallback(async () => {
    setStatus("Loading");
    setError("");
    try {
      const response = await fetch("/config");
      if (response.status === 401) {
        setStatus("Authentication required");
        return;
      }
      if (!response.ok) {
        throw new Error(`Config failed with HTTP ${response.status}`);
      }

      const nextConfig = (await response.json()) as StudioConfig;
      setConfig(nextConfig);
      setSelectedAgentId((current) => current || nextConfig.agents[0]?.id || "");
      setStatus("Connected");
    } catch (loadError) {
      setError(errorMessage(loadError));
      setStatus("Config error");
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const sessionsEnabled = config?.capabilities.sessions?.enabled === true;
  const tracesEnabled = config?.capabilities.traces?.enabled === true;

  const loadAllSessions = useCallback(async () => {
    if (!sessionsEnabled) {
      setAllSessions([]);
      return;
    }

    try {
      const response = await fetch("/sessions?limit=100");
      if (!response.ok) {
        throw new Error(`Sessions failed with HTTP ${response.status}`);
      }
      const body = (await response.json()) as { sessions: StudioSessionSummary[] };
      setAllSessions(body.sessions);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, [sessionsEnabled]);

  useEffect(() => {
    void loadAllSessions();
  }, [loadAllSessions]);

  async function createSession(title: string): Promise<StudioSessionSummary> {
    const response = await fetch("/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        agentId: selectedAgentId,
        title,
        metadata: {
          source: "aion-studio",
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Session create failed with HTTP ${response.status}`);
    }
    const session = (await response.json()) as StudioSessionSummary;
    setSelectedSessionId(session.id);
    setAllSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
    updateSessionPath(session.id);
    return session;
  }

  const loadTraces = useCallback(async () => {
    if (!tracesEnabled) {
      setTraces([]);
      return;
    }

    setTraceLoadState("loading");
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (traceAgentFilter !== "all") {
        params.set("agentId", traceAgentFilter);
      }
      if (traceSessionFilter !== "all") {
        params.set("sessionId", traceSessionFilter);
      }
      if (traceStatusFilter !== "all") {
        params.set("status", traceStatusFilter);
      }

      const response = await fetch(`/traces?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Traces failed with HTTP ${response.status}`);
      }
      const body = (await response.json()) as { traces: StudioTraceSummary[] };
      const loaded = await Promise.all(
        body.traces.map(async (trace) => {
          const traceResponse = await fetch(`/traces/${encodeURIComponent(trace.id)}`);
          if (!traceResponse.ok) {
            throw new Error(`Trace load failed with HTTP ${traceResponse.status}`);
          }
          return (await traceResponse.json()) as StudioTrace;
        }),
      );
      if (selectedTraceId.length > 0 && !loaded.some((trace) => trace.id === selectedTraceId)) {
        const traceResponse = await fetch(`/traces/${encodeURIComponent(selectedTraceId)}`);
        if (traceResponse.ok) {
          setTraces([(await traceResponse.json()) as StudioTrace, ...loaded]);
          return;
        }
      }
      setTraces(loaded);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setTraceLoadState("idle");
    }
  }, [selectedTraceId, traceAgentFilter, traceSessionFilter, traceStatusFilter, tracesEnabled]);

  useEffect(() => {
    if (activePage !== "tracing") {
      return;
    }
    void loadTraces();
  }, [activePage, loadTraces]);

  const loadSession = useCallback(
    async (sessionId: string, options: { updatePath?: boolean } = {}) => {
      if (runState === "running") {
        return;
      }

      setSessionLoadState("loading");
      setError("");
      try {
        const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}`);
        if (!response.ok) {
          throw new Error(`Session load failed with HTTP ${response.status}`);
        }
        const session = (await response.json()) as StudioSession;
        setTranscriptSequence(nextSequence(session.transcript));
        setSelectedAgentId(session.agentId);
        setSelectedSessionId(session.id);
        setMessages(session.transcript);
        if (options.updatePath !== false) {
          setActivePage("playground");
          updateSessionPath(session.id);
        }
        setStatus("Connected");
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setSessionLoadState("idle");
      }
    },
    [runState],
  );

  const startNewChat = useCallback(
    (options: { updatePath?: boolean } = {}) => {
      if (runState === "running") {
        return;
      }
      resetTranscriptSequence();
      setSelectedSessionId("");
      setMessages([]);
      setPrompt("");
      setActivePage("playground");
      setError("");
      if (options.updatePath !== false) {
        updateSessionPath(undefined);
      }
      requestAnimationFrame(() => resizeTextarea(promptRef.current));
    },
    [runState],
  );

  const selectPlaygroundAgent = useCallback(
    (agentId: string) => {
      if (runState === "running" || agentId === selectedAgentId) {
        return;
      }

      setSelectedAgentId(agentId);
      resetTranscriptSequence();
      setSelectedSessionId("");
      setMessages([]);
      setPrompt("");
      setActivePage("playground");
      setError("");
      updateSessionPath(undefined);
      requestAnimationFrame(() => resizeTextarea(promptRef.current));
    },
    [runState, selectedAgentId],
  );

  async function deleteSession(session: StudioSessionSummary) {
    if (runState === "running") {
      return;
    }

    setError("");
    try {
      const response = await fetch(`/sessions/${encodeURIComponent(session.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Session delete failed with HTTP ${response.status}`);
      }

      setAllSessions((current) => current.filter((item) => item.id !== session.id));
      setTraces((current) => current.filter((trace) => trace.sessionId !== session.id));
      if (traceSessionFilter === session.id) {
        setTraceSessionFilter("all");
      }
      if (selectedSessionId === session.id) {
        resetTranscriptSequence();
        setSelectedSessionId("");
        setMessages([]);
        setPrompt("");
        if (activePage === "playground") {
          updateSessionPath(undefined);
        }
      }
      setStatus("Connected");
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeleteCandidate(undefined);
    }
  }

  useEffect(() => {
    if (!sessionsEnabled) {
      return;
    }

    const location = pageLocationFromLocation();
    setActivePage(location.page);
    setSelectedTraceId(location.traceId ?? "");
    if (
      location.page !== "playground" ||
      location.sessionId === undefined ||
      location.sessionId === selectedSessionId
    ) {
      return;
    }
    void loadSession(location.sessionId, { updatePath: false });
  }, [selectedSessionId, sessionsEnabled, loadSession]);

  useEffect(() => {
    function handlePopState() {
      const location = pageLocationFromLocation();
      setActivePage(location.page);
      setSelectedTraceId(location.traceId ?? "");
      if (location.page !== "playground") {
        return;
      }
      if (location.sessionId === undefined) {
        startNewChat({ updatePath: false });
        return;
      }
      void loadSession(location.sessionId, { updatePath: false });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [loadSession, startNewChat]);

  async function runPrompt(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || selectedAgentId.length === 0 || runState === "running") {
      return;
    }

    setRunState("running");
    setActivePage("playground");
    setError("");
    setPrompt("");
    requestAnimationFrame(() => resizeTextarea(promptRef.current));
    setMessages((current) => [
      ...current,
      { entryId: nextTranscriptId(), kind: "message", role: "user", text: trimmed },
    ]);

    try {
      const sessionId =
        sessionsEnabled && selectedSessionId.length === 0
          ? (await createSession(titleFromText(trimmed))).id
          : selectedSessionId;
      const history = sessionsEnabled ? undefined : toHistory(messages);
      const response = await fetch(`/agents/${encodeURIComponent(selectedAgentId)}/runs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          ...(sessionId.length === 0 ? {} : { sessionId }),
          ...(history === undefined ? {} : { history }),
          stream: true,
          metadata: {
            source: "aion-studio",
          },
        }),
      });

      if (response.status === 401) {
        throw new Error("Authentication required");
      }
      if (!response.ok || response.body === null) {
        throw new Error(`Run failed with HTTP ${response.status}`);
      }

      await readJsonl(response.body, async (event) => {
        const visibleDelta = acceptStreamEvent(event as AgentRunStreamEvent);
        if (visibleDelta) {
          await nextPaint();
        }
      });
      await loadAllSessions();
      if (sessionId.length > 0) {
        setSelectedSessionId(sessionId);
      }
      setStatus("Connected");
    } catch (runError) {
      const message = errorMessage(runError);
      setError(message);
      appendAssistantText(`\n${message}`);
    } finally {
      setRunState("idle");
    }
  }

  function acceptStreamEvent(event: AgentRunStreamEvent): boolean {
    if (event.type === "text_delta") {
      appendAssistantText(event.delta);
      return true;
    }
    if (event.type === "reasoning_delta") {
      appendReasoningText(event.delta, event.id);
      return true;
    }
    if (event.type === "tool_call") {
      appendToolCall(
        event.toolCall.function.name,
        formatToolValue(event.toolCall.function.arguments),
        event.toolCall.callId ?? event.toolCall.id,
      );
      return true;
    }
    if (event.type === "tool_result") {
      appendToolResult({
        toolName: event.toolName,
        callId: event.toolCallId,
        args: event.args,
        result: event.result,
      });
      return true;
    }
    if (event.type === "tool_approval_request") {
      updateToolApproval(event.approval);
      return true;
    }
    if (event.type === "tool_approval_result") {
      updateToolApproval(event.approval);
      return true;
    }
    if (event.type === "error") {
      setError(JSON.stringify(event.error));
    }
    return false;
  }

  function appendAssistantText(delta: string) {
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);
      if (last?.kind === "message" && last.role === "assistant") {
        next[next.length - 1] = { ...last, text: `${last.text}${delta}` };
      } else {
        next.push({
          entryId: nextTranscriptId(),
          kind: "message",
          role: "assistant",
          text: delta,
        });
      }
      return next;
    });
  }

  function updateToolApproval(approval: ToolApprovalUpdate) {
    setMessages((current) => {
      const next = [...current];
      const matchedIndex = findMatchingToolIndexByCall(next, approval.toolName, approval.callId);
      if (matchedIndex < 0) {
        next.push({
          entryId: nextTranscriptId(),
          kind: "tool",
          toolName: approval.toolName,
          ...(approval.callId === undefined ? {} : { callId: approval.callId }),
          approval: {
            id: approval.id,
            status: approval.status,
            requestedAt: approval.requestedAt,
            ...(approval.resolvedAt === undefined ? {} : { resolvedAt: approval.resolvedAt }),
            ...(approval.reason === undefined ? {} : { reason: approval.reason }),
          },
        });
        return next;
      }

      const existing = next[matchedIndex];
      if (existing !== undefined && existing.kind === "tool") {
        next[matchedIndex] = {
          ...existing,
          approval: {
            id: approval.id,
            status: approval.status,
            requestedAt: approval.requestedAt,
            ...(approval.resolvedAt === undefined ? {} : { resolvedAt: approval.resolvedAt }),
            ...(approval.reason === undefined ? {} : { reason: approval.reason }),
          },
        };
      }
      return next;
    });
  }

  async function decideToolApproval(approvalId: string, approved: boolean) {
    if (decidingApprovals.has(approvalId)) {
      return;
    }

    setDecidingApprovals((current) => new Set(current).add(approvalId));
    setError("");
    try {
      const response = await fetch(`/approvals/${encodeURIComponent(approvalId)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (!response.ok) {
        throw new Error(`Approval decision failed with HTTP ${response.status}`);
      }
      const approval = await response.json();
      updateToolApproval(approval);
    } catch (decisionError) {
      setError(errorMessage(decisionError));
    } finally {
      setDecidingApprovals((current) => {
        const next = new Set(current);
        next.delete(approvalId);
        return next;
      });
    }
  }

  function appendReasoningText(delta: string, reasoningId: string | undefined) {
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);
      if (last?.kind === "reasoning" && (last.reasoningId ?? "") === (reasoningId ?? "")) {
        next[next.length - 1] = { ...last, text: `${last.text}${delta}` };
      } else {
        next.push({
          entryId: nextTranscriptId(),
          kind: "reasoning",
          ...(reasoningId === undefined ? {} : { reasoningId }),
          text: delta,
        });
      }
      return next;
    });
  }

  function appendToolCall(toolName: string, args: string, callId: string | undefined) {
    setMessages((current) => [
      ...current,
      {
        entryId: nextTranscriptId(),
        kind: "tool",
        toolName,
        ...(callId === undefined ? {} : { callId }),
        ...(args.length === 0 ? {} : { args }),
      },
    ]);
  }

  function appendToolResult(props: {
    toolName: string;
    callId: string | undefined;
    args: string;
    result: string;
  }) {
    setMessages((current) => {
      const next = [...current];
      const matchedIndex = findMatchingToolIndex(next, props.toolName, props.callId);
      if (matchedIndex >= 0) {
        const existing = next[matchedIndex];
        if (existing !== undefined && existing.kind === "tool") {
          next[matchedIndex] = {
            ...existing,
            args: existing.args ?? props.args,
            result: props.result,
          };
          return next;
        }
      }

      next.push({
        entryId: nextTranscriptId(),
        kind: "tool",
        toolName: props.toolName,
        ...(props.callId === undefined ? {} : { callId: props.callId }),
        args: props.args,
        result: props.result,
      });
      return next;
    });
  }

  function updatePrompt(event: ChangeEvent<HTMLTextAreaElement>) {
    setPrompt(formValue(event));
    resizeTextarea(event.currentTarget);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void runPrompt(prompt);
  }

  const agents = config?.agents ?? [];
  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? undefined;
  const hasMessages = messages.length > 0;
  const filteredTraceSessions =
    traceAgentFilter === "all"
      ? allSessions
      : allSessions.filter((session) => session.agentId === traceAgentFilter);

  function navigatePage(page: ActivePage) {
    setActivePage(page);
    if (page !== "tracing") {
      setSelectedTraceId("");
    }
    if (page === "playground" && selectedSessionId.length > 0) {
      updateSessionPath(selectedSessionId);
      return;
    }
    updatePagePath(page);
  }

  function selectTrace(traceId: string) {
    setSelectedTraceId(traceId);
    if (traceId.length === 0) {
      updatePagePath("tracing");
      return;
    }
    updateTracePath(traceId);
  }

  return (
    <div className="grid min-h-screen overflow-hidden bg-background text-foreground lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="flex min-h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-sidebar-foreground">
            <img className="h-6 w-6 shrink-0" src={logoSrc} alt="" />
            <span className="truncate">Aion Studio</span>
          </span>
          <Button
            aria-label="New chat"
            className="h-8 min-h-8 w-8 border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            size="icon"
            variant="ghost"
            type="button"
            onClick={() => startNewChat()}
          >
            <Plus />
          </Button>
        </div>
        <nav
          className="grid gap-0 border-b border-sidebar-border px-2 pb-1 pt-2"
          aria-label="Studio navigation"
        >
          <NavButton
            active={activePage === "playground"}
            icon="message"
            label="Playground"
            onClick={() => navigatePage("playground")}
          />
          <NavButton
            active={activePage === "tracing"}
            icon="activity"
            label="Tracing"
            onClick={() => navigatePage("tracing")}
          />
          <NavButton
            active={activePage === "sessions"}
            icon="list"
            label="Sessions"
            onClick={() => navigatePage("sessions")}
          />
          <NavButton
            active={activePage === "agents"}
            icon="bot"
            label="Agents"
            onClick={() => navigatePage("agents")}
          />
        </nav>
        <div className="mt-6 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] px-2 pb-2 pt-1">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            Recent sessions
          </div>
          <ScrollArea className="min-h-0 overflow-hidden">
            <div className="grid content-start gap-0">
              {sessionsEnabled ? (
                <>
                  {sessionLoadState === "loading" && allSessions.length === 0 ? (
                    <div className="rounded-md px-2 py-2 text-xs font-medium text-muted-foreground">
                      Loading sessions
                    </div>
                  ) : null}
                  {sessionLoadState === "idle" && allSessions.length === 0 ? (
                    <div className="rounded-md px-2 py-2 text-xs font-medium text-muted-foreground">
                      No sessions
                    </div>
                  ) : null}
                  {allSessions.map((session) => (
                    <div
                      key={session.id}
                      className={cn(
                        "group grid h-8 min-h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 rounded-md border border-transparent px-2 text-muted-foreground",
                        session.id === selectedSessionId && "bg-muted text-foreground",
                      )}
                    >
                      <Button
                        className="flex h-6 min-h-6 min-w-0 justify-start rounded-none border-0 bg-transparent p-0 text-left text-inherit hover:bg-transparent hover:text-inherit"
                        type="button"
                        variant="ghost"
                        onClick={() => void loadSession(session.id)}
                      >
                        <span className="min-w-0 truncate text-sm font-medium leading-none">
                          {session.title ?? "Untitled chat"}
                        </span>
                      </Button>
                      <span className="relative flex h-6 w-8 shrink-0 items-center justify-end">
                        <span className="text-xs font-medium leading-none tabular-nums text-muted-foreground opacity-100 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
                          {formatRelativeTime(session.updatedAt)}
                        </span>
                        <Button
                          aria-label={`Delete ${session.title ?? "Untitled chat"}`}
                          className="absolute right-0 h-6 min-h-6 w-6 border-0 bg-transparent p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-transparent hover:text-destructive hover:opacity-100 group-hover:opacity-80 group-focus-within:opacity-80 [&_svg]:h-3.5 [&_svg]:w-3.5"
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() => setDeleteCandidate(session)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="rounded-md px-2 py-2 text-xs font-medium text-muted-foreground">
                  Sessions disabled
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      <main className="grid h-screen min-w-0 grid-rows-[56px_minmax(0,1fr)_auto] overflow-hidden bg-background">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background px-5">
          <div className="min-w-0 truncate text-sm font-semibold text-foreground">
            {pageTitle(activePage, selectedAgent?.name ?? selectedAgent?.id)}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <Badge
              className={cn(
                "min-h-7 max-w-[min(42vw,480px)] gap-2 overflow-hidden truncate rounded-md px-2.5 py-1 text-xs",
                error.length > 0
                  ? "border-destructive/40 bg-destructive/15 text-destructive"
                  : status === "Connected"
                    ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-100"
                    : "border-border bg-muted text-foreground",
              )}
              variant={error.length > 0 ? "destructive" : "default"}
            >
              {error.length === 0 ? (
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    status === "Connected" ? "bg-emerald-300" : "bg-primary",
                  )}
                  aria-hidden="true"
                />
              ) : null}
              {error || status}
            </Badge>
          </div>
        </header>

        {activePage === "playground" ? (
          <section className="grid min-h-0 bg-background p-6">
            {hasMessages ? null : (
              <section
                className="mx-auto grid w-full max-w-[760px] content-center justify-items-center gap-2 text-center"
                aria-label="Assistant welcome"
              >
                <h1 className="m-0 text-2xl font-semibold leading-tight text-foreground">
                  Playground
                </h1>
                <p className="m-0 text-sm font-medium text-muted-foreground">Ready when you are.</p>
              </section>
            )}

            <section className="min-h-0 overflow-auto">
              <div className="mx-auto grid min-h-full w-full max-w-[900px] content-start items-start gap-4 pb-4">
                {messages.map((message) => (
                  <TranscriptItem
                    key={message.entryId}
                    entry={message}
                    decidingApprovals={decidingApprovals}
                    onApprovalDecision={(approvalId, approved) =>
                      void decideToolApproval(approvalId, approved)
                    }
                  />
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {activePage === "tracing" ? (
          <section className="grid min-h-0 overflow-hidden bg-background p-6">
            <TraceBrowser
              agents={agents}
              sessions={filteredTraceSessions}
              traces={traces}
              tracesEnabled={tracesEnabled}
              traceLoadState={traceLoadState}
              selectedTraceId={selectedTraceId}
              agentFilter={traceAgentFilter}
              sessionFilter={traceSessionFilter}
              statusFilter={traceStatusFilter}
              onAgentFilterChange={(agentId) => {
                setTraceAgentFilter(agentId);
                setTraceSessionFilter("all");
              }}
              onSessionFilterChange={setTraceSessionFilter}
              onStatusFilterChange={setTraceStatusFilter}
              onRefresh={() => void loadTraces()}
              onSelectTrace={selectTrace}
            />
          </section>
        ) : null}

        {activePage === "sessions" ? (
          <section className="grid min-h-0 overflow-hidden bg-background p-6">
            <SessionsPage
              agents={agents}
              sessions={allSessions}
              sessionsEnabled={sessionsEnabled}
              sessionLoadState={sessionLoadState}
              selectedSessionId={selectedSessionId}
              onOpenSession={(sessionId) => void loadSession(sessionId)}
              onDeleteSession={setDeleteCandidate}
            />
          </section>
        ) : null}

        {activePage === "agents" ? (
          <section className="grid min-h-0 overflow-hidden bg-background p-6">
            <AgentsPage agents={agents} selectedAgentId={selectedAgentId} />
          </section>
        ) : null}

        {activePage === "playground" ? (
          <form
            className="bg-background px-6 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              void runPrompt(prompt);
            }}
          >
            <div className="mx-auto grid min-h-24 w-full max-w-[900px] gap-3 rounded-lg border border-border bg-background p-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
              <Textarea
                className="min-w-0 rounded-none border-0 bg-transparent p-0 text-sm text-foreground shadow-none outline-none ring-0 focus:border-transparent focus:ring-0"
                ref={promptRef}
                rows={1}
                value={prompt}
                onChange={updatePrompt}
                onKeyDown={handlePromptKeyDown}
                placeholder="Message AI Chat..."
              />
              <div className="flex min-w-0 items-center justify-between gap-2">
                {agents.length > 1 ? (
                  <Select
                    value={selectedAgent?.id ?? selectedAgentId}
                    onValueChange={selectPlaygroundAgent}
                    disabled={runState === "running"}
                  >
                    <SelectTrigger
                      aria-label="Select agent"
                      className="h-8 min-h-8 w-auto max-w-[min(70vw,18rem)] gap-2 rounded-md px-2.5 py-0 text-xs font-medium"
                    >
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent align="start">
                      {agents.map((agent) => (
                        <SelectItem value={agent.id} key={agent.id}>
                          {agent.name ?? agent.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span aria-hidden="true" />
                )}
                <Button
                  aria-label={runState === "running" ? "Running" : "Send message"}
                  className="h-8 min-h-8 w-8 rounded-md border-border bg-primary p-0 text-primary-foreground hover:bg-primary/90 [&_svg]:h-4 [&_svg]:w-4"
                  size="icon"
                  type="submit"
                  disabled={runState === "running" || selectedAgentId.length === 0}
                >
                  <ArrowUp />
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </main>
      <DeleteSessionDialog
        session={deleteCandidate}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteCandidate(undefined);
          }
        }}
        onConfirm={(session) => void deleteSession(session)}
      />
    </div>
  );
}
