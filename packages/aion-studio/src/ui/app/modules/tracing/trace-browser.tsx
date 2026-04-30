import { useState } from "react";
import type { StudioConfig, StudioSessionSummary, StudioTrace } from "../../../../types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/utils";
import {
  emptyFallback,
  formatDuration,
  formatToolValue,
  formatTraceDate,
  formatTraceTime,
  formatUsage,
  toTraceStatusFilter,
  traceAgentLabel,
} from "../shared/format";
import { isRecord } from "../shared/object";
import { messageText } from "../shared/transcript";
import type {
  TraceInspectorKey,
  TraceLoadState,
  TraceObservationItem,
  TraceStatusFilter,
} from "../shared/types";

export function TraceBrowser(props: {
  agents: StudioConfig["agents"];
  sessions: StudioSessionSummary[];
  traces: StudioTrace[];
  tracesEnabled: boolean;
  traceLoadState: TraceLoadState;
  selectedTraceId: string;
  agentFilter: string;
  sessionFilter: string;
  statusFilter: TraceStatusFilter;
  onAgentFilterChange: (agentId: string) => void;
  onSessionFilterChange: (sessionId: string) => void;
  onStatusFilterChange: (status: TraceStatusFilter) => void;
  onRefresh: () => void;
  onSelectTrace: (traceId: string) => void;
}) {
  if (!props.tracesEnabled) {
    return (
      <div className="w-full rounded-lg border border-dashed border-border p-8 text-sm font-medium text-muted-foreground">
        Tracing is disabled
      </div>
    );
  }

  const selectedTrace =
    props.selectedTraceId.length === 0
      ? undefined
      : props.traces.find((trace) => trace.id === props.selectedTraceId);

  return (
    <section
      className="grid h-full min-h-0 w-full grid-rows-[auto_auto_minmax(0,1fr)] content-stretch gap-4"
      aria-label="Tracing"
    >
      <header className="flex min-w-0 items-center justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            Observability
          </p>
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Tracing</h1>
        </div>
        <Button size="sm" type="button" onClick={props.onRefresh}>
          Refresh
        </Button>
      </header>
      <Card className="grid gap-3 rounded-lg border-border bg-background p-3 md:grid-cols-3">
        <div className="grid min-w-0 gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            Agent
          </span>
          <Select value={props.agentFilter} onValueChange={props.onAgentFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {props.agents.map((agent) => (
                <SelectItem value={agent.id} key={agent.id}>
                  {agent.name ?? agent.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            Session
          </span>
          <Select value={props.sessionFilter} onValueChange={props.onSessionFilterChange}>
            <SelectTrigger>
              <SelectValue placeholder="All sessions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sessions</SelectItem>
              {props.sessions.map((session) => (
                <SelectItem value={session.id} key={session.id}>
                  {session.title ?? session.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            Status
          </span>
          <Select
            value={props.statusFilter}
            onValueChange={(value) => props.onStatusFilterChange(toTraceStatusFilter(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="running">Running</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>
      {props.selectedTraceId.length === 0 ? (
        <TraceTable
          agents={props.agents}
          traces={props.traces}
          traceLoadState={props.traceLoadState}
          onSelectTrace={props.onSelectTrace}
        />
      ) : (
        <TraceDetailRoute
          selectedTrace={selectedTrace}
          selectedTraceId={props.selectedTraceId}
          traceLoadState={props.traceLoadState}
          onBack={() => props.onSelectTrace("")}
        />
      )}
    </section>
  );
}

function TraceTable(props: {
  agents: StudioConfig["agents"];
  traces: StudioTrace[];
  traceLoadState: TraceLoadState;
  onSelectTrace: (traceId: string) => void;
}) {
  return (
    <Card
      className="min-h-0 overflow-hidden rounded-lg border-border bg-background"
      aria-label="Traces"
    >
      <ScrollArea className="h-full min-h-0">
        <div className="min-w-[960px]">
          <div className="grid min-h-10 grid-cols-[minmax(220px,1.3fr)_120px_120px_120px_120px_110px_90px] items-center gap-4 border-b border-border px-4 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            <span>Trace</span>
            <span>Agent</span>
            <span>Status</span>
            <span>Started</span>
            <span>Duration</span>
            <span>First delta</span>
            <span>Events</span>
          </div>
          {props.traceLoadState === "loading" && props.traces.length === 0 ? (
            <div className="rounded-md px-4 py-4 text-sm font-medium text-muted-foreground">
              Loading traces
            </div>
          ) : null}
          {props.traceLoadState === "idle" && props.traces.length === 0 ? (
            <div className="rounded-md px-4 py-4 text-sm font-medium text-muted-foreground">
              No traces found
            </div>
          ) : null}
          {props.traces.map((trace) => (
            <Button
              className="grid h-auto min-h-14 w-full grid-cols-[minmax(220px,1.3fr)_120px_120px_120px_120px_110px_90px] items-center justify-start gap-4 whitespace-normal rounded-none border-0 border-b border-border bg-transparent px-4 py-2.5 text-left text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              type="button"
              variant="ghost"
              key={trace.id}
              onClick={() => props.onSelectTrace(trace.id)}
            >
              <span className="grid min-w-0 gap-0.5">
                <strong className="min-w-0 truncate text-sm font-medium text-foreground">
                  {trace.name ?? "agent.run"}
                </strong>
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {trace.id}
                </span>
              </span>
              <span className="min-w-0 truncate text-xs font-medium">
                {traceAgentLabel(props.agents, trace)}
              </span>
              <span className="flex min-w-0 items-center gap-2 text-xs font-medium capitalize">
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", statusDotClass(trace.status))}
                />
                <span className="min-w-0 truncate">{trace.status}</span>
              </span>
              <span className="min-w-0 truncate text-xs font-medium">
                {formatTraceDate(trace.startedAt)}
              </span>
              <span className="min-w-0 truncate text-xs font-medium">
                {emptyFallback(formatDuration(trace.durationMs))}
              </span>
              <span className="min-w-0 truncate text-xs font-medium">
                {emptyFallback(formatDuration(firstDeltaMsFromObservations(trace.observations)))}
              </span>
              <span className="min-w-0 truncate text-xs font-medium tabular-nums">
                {trace.observationCount}
              </span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}

function TraceDetailRoute(props: {
  selectedTrace: StudioTrace | undefined;
  selectedTraceId: string;
  traceLoadState: TraceLoadState;
  onBack: () => void;
}) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Button
          className="h-8 min-h-8 px-3 text-xs font-medium"
          type="button"
          variant="secondary"
          onClick={props.onBack}
        >
          Back to traces
        </Button>
        <span className="min-w-0 truncate font-mono text-xs font-medium text-muted-foreground">
          {props.selectedTraceId}
        </span>
      </div>
      <div className="min-h-0 min-w-0 overflow-hidden">
        {props.selectedTrace === undefined ? (
          <Card className="grid h-full place-items-center rounded-lg border-border bg-background p-6 text-sm font-medium text-muted-foreground">
            {props.traceLoadState === "loading" ? "Loading trace" : "Trace not found"}
          </Card>
        ) : (
          <TracePanel traces={[props.selectedTrace]} />
        )}
      </div>
    </div>
  );
}

function TracePanel(props: { traces: StudioTrace[] }) {
  const orderedTraces = [...props.traces].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
  );
  return (
    <Card
      className="grid h-full min-h-0 w-full content-stretch overflow-hidden rounded-lg border-border bg-background"
      aria-label="Traces"
    >
      {orderedTraces.map((trace) => (
        <TraceEntry key={trace.id} trace={trace} />
      ))}
    </Card>
  );
}

function TraceEntry(props: { trace: StudioTrace }) {
  const [activeKey, setActiveKey] = useState<TraceInspectorKey>("trace");
  const turns = traceTurns(props.trace);

  return (
    <article className="min-h-0 w-full text-foreground">
      <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden max-md:grid-cols-1">
        <nav
          className="grid min-h-0 auto-rows-min content-start overflow-auto border-r border-border bg-background max-md:max-h-80 max-md:border-b max-md:border-r-0"
          aria-label="Trace timeline"
        >
          <div className="sticky top-0 z-10 flex min-h-11 items-center justify-between border-b border-border bg-background px-3 text-xs font-medium text-muted-foreground">
            <span>Search</span>
            <strong className="text-foreground">Timeline</strong>
          </div>
          <TraceTreeRow
            active={activeKey === "trace"}
            tone="trace"
            title={props.trace.name ?? "support-ticket-summary"}
            subtitle={formatDuration(props.trace.durationMs)}
            onSelect={() => setActiveKey("trace")}
          />
          <TraceTreeRow
            active={activeKey === "agent"}
            tone="agent"
            title="agent.run"
            subtitle={formatDuration(props.trace.durationMs)}
            onSelect={() => setActiveKey("agent")}
          />
          {turns.map((turn) => (
            <div className="contents" key={turn.turn}>
              <TraceTreeRow
                active={activeKey === `turn:${turn.turn}`}
                tone="turn"
                title={`turn.${turn.turn}`}
                subtitle={formatDuration(turn.durationMs)}
                onSelect={() => setActiveKey(`turn:${turn.turn}`)}
              />
              {turn.observations.map((observation) => {
                const usageText = observationUsageText(observation);
                return (
                  <TraceTreeRow
                    active={activeKey === `observation:${observation.id}`}
                    tone={observation.kind}
                    title={traceObservationLabel(observation)}
                    subtitle={
                      usageText.length > 0
                        ? `${formatDuration(observation.durationMs)} · ${usageText}`
                        : formatDuration(observation.durationMs)
                    }
                    onSelect={() => setActiveKey(`observation:${observation.id}`)}
                    key={observation.id}
                  />
                );
              })}
            </div>
          ))}
        </nav>
        <TraceDetailPane trace={props.trace} turns={turns} activeKey={activeKey} />
      </div>
    </article>
  );
}

function TraceTreeRow(props: {
  active: boolean;
  tone: "trace" | "agent" | "turn" | StudioTrace["observations"][number]["kind"];
  title: string;
  subtitle: string;
  onSelect: () => void;
}) {
  return (
    <Button
      className={cn(
        "grid h-auto min-h-0 w-full min-w-0 grid-cols-[18px_minmax(0,1fr)] items-start justify-start gap-2 whitespace-normal rounded-none border-0 bg-transparent px-3 py-2 text-left text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        props.active && "bg-muted text-foreground",
      )}
      type="button"
      variant="ghost"
      onClick={props.onSelect}
    >
      <span
        className={cn("mt-1.5 h-2.5 w-2.5 rounded-full border", traceToneDotClass(props.tone))}
      />
      <span className="grid min-w-0 gap-0.5">
        <strong className="min-w-0 truncate text-sm font-medium leading-5 text-current">
          {props.title}
        </strong>
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          {props.subtitle}
        </span>
      </span>
    </Button>
  );
}

function TraceDetailPane(props: {
  trace: StudioTrace;
  turns: Array<{ turn: number; observations: TraceObservationItem[]; durationMs?: number }>;
  activeKey: TraceInspectorKey;
}) {
  const selected = selectedTraceDetail(props.trace, props.turns, props.activeKey);
  return (
    <section
      className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-auto bg-background"
      aria-label="Trace detail"
    >
      <header className="grid gap-3 border-b border-border px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "mt-1.5 h-2.5 w-2.5 rounded-full border",
              traceToneDotClass(selected.tone),
            )}
          />
          <h2 className="m-0 min-w-0 truncate text-xl font-semibold leading-tight text-foreground">
            {selected.title}
          </h2>
        </div>
        <div className="text-sm font-medium text-muted-foreground">{selected.startedAt}</div>
        <div className="flex flex-wrap gap-2">
          <Badge>Duration: {formatDuration(selected.durationMs)}</Badge>
          {selected.firstDeltaMs === undefined ? null : (
            <Badge>First delta: {formatDuration(selected.firstDeltaMs)}</Badge>
          )}
          <Badge>Env: default</Badge>
          {selected.usage.length > 0 ? <Badge>{selected.usage}</Badge> : null}
        </div>
      </header>
      <div className="grid min-w-0 content-start gap-4 p-4">
        {selected.input === undefined ? null : (
          <TraceDataSection title="Input" value={selected.input} />
        )}
        {selected.output === undefined ? null : (
          <TraceDataSection title="Output" value={selected.output} tone="success" />
        )}
        {selected.error === undefined ? null : (
          <TraceDataSection title="Error" value={selected.error} tone="error" />
        )}
        <TraceDataSection title="Metadata" value={selected.metadata} />
      </div>
    </section>
  );
}

function TraceDataSection(props: { title: string; value: unknown; tone?: "success" | "error" }) {
  const rows = plainTraceValue(props.title, props.value);
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="m-0 text-base font-semibold leading-tight text-foreground">{props.title}</h3>
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-background",
          props.tone === "success" && "border-primary/40 bg-primary/10",
          props.tone === "error" && "border-destructive/40 bg-destructive/10",
        )}
      >
        {rows.map((item) => (
          <div
            className="grid gap-2 border-b border-border px-3 py-3 last:border-b-0"
            key={`${item.label}-${item.text}`}
          >
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {item.label}
            </span>
            <p
              className={cn(
                "m-0 whitespace-pre-wrap text-sm leading-6 text-foreground [overflow-wrap:anywhere]",
                props.tone === "success" && "text-primary",
                props.tone === "error" && "text-destructive",
              )}
            >
              {item.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function plainTraceValue(title: string, value: unknown): Array<{ label: string; text: string }> {
  const messageRows = plainTraceInput(value);
  if (messageRows.length > 0) {
    return messageRows;
  }
  if (!isRecord(value)) {
    return [{ label: title, text: plainTraceText(value) }];
  }

  const rows: Array<{ label: string; text: string }> = [];
  for (const [key, item] of Object.entries(value)) {
    const nestedMessages = plainTraceInput(item);
    if (nestedMessages.length > 0) {
      rows.push(
        ...nestedMessages.map((message) => ({
          label: `${key} ${message.label}`,
          text: message.text,
        })),
      );
      continue;
    }
    rows.push({ label: key, text: plainTraceText(item) });
  }
  return rows.length > 0 ? rows : [{ label: title, text: "Empty object" }];
}

function plainTraceInput(value: unknown): Array<{ label: string; text: string }> {
  if (typeof value === "string") {
    return [{ label: "Input", text: value }];
  }
  if (Array.isArray(value)) {
    return value
      .map((item, index) => ({
        label: isRecord(item) && typeof item.role === "string" ? item.role : `Item ${index + 1}`,
        text: messageText(item) || formatToolValue(item),
      }))
      .filter((item) => item.text.length > 0);
  }
  if (!isRecord(value)) {
    return [];
  }

  const chatHistory = Array.isArray(value.chatHistory) ? value.chatHistory : undefined;
  if (chatHistory !== undefined) {
    return plainTraceInput(chatHistory);
  }

  if (Array.isArray(value.prompt)) {
    return plainTraceInput(value.prompt);
  }

  const rows: Array<{ label: string; text: string }> = [];
  const promptText = messageText(value.prompt);
  if (promptText.length > 0) {
    rows.push({ label: "Prompt", text: promptText });
  }

  const history = Array.isArray(value.history) ? value.history : [];
  if (history.length > 0) {
    rows.push(...plainTraceInput(history));
  }

  return rows;
}

function plainTraceText(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function traceTurns(trace: StudioTrace): Array<{
  turn: number;
  observations: TraceObservationItem[];
  durationMs?: number;
}> {
  const grouped = new Map<number, TraceObservationItem[]>();
  for (const observation of trace.observations) {
    const turn = Number.isFinite(observation.turn) ? observation.turn : grouped.size + 1;
    grouped.set(turn, [...(grouped.get(turn) ?? []), observation]);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([turn, observations]) => ({
      turn,
      observations,
      durationMs: observations.reduce(
        (total, observation) => total + (observation.durationMs ?? 0),
        0,
      ),
    }));
}

function selectedTraceDetail(
  trace: StudioTrace,
  turns: Array<{ turn: number; observations: TraceObservationItem[]; durationMs?: number }>,
  activeKey: TraceInspectorKey,
): {
  title: string;
  tone: "trace" | "agent" | "turn" | StudioTrace["observations"][number]["kind"];
  startedAt: string;
  durationMs: number | undefined;
  firstDeltaMs: number | undefined;
  usage: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata: unknown;
} {
  if (activeKey === "agent") {
    return {
      title: "agent.run",
      tone: "agent",
      startedAt: formatTraceTime(trace.startedAt),
      durationMs: trace.durationMs,
      firstDeltaMs: firstDeltaMsFromObservations(trace.observations),
      usage: formatUsage(trace.usage),
      input: trace.input,
      output: trace.output,
      error: trace.error,
      metadata: trace.metadata ?? {},
    };
  }
  if (activeKey.startsWith("turn:")) {
    const turnNumber = Number(activeKey.slice("turn:".length));
    const turn = turns.find((item) => item.turn === turnNumber);
    return {
      title: `turn.${Number.isFinite(turnNumber) ? turnNumber : 1}`,
      tone: "turn",
      startedAt: formatTraceTime(turn?.observations[0]?.startedAt ?? trace.startedAt),
      durationMs: turn?.durationMs,
      firstDeltaMs: firstDeltaMsFromObservations(turn?.observations ?? []),
      usage: turnUsageText(turn?.observations ?? []),
      input: turn?.observations[0]?.input,
      output: turn?.observations.at(-1)?.output,
      metadata: {
        turn: turnNumber,
        observations: turn?.observations.length ?? 0,
      },
    };
  }
  if (activeKey.startsWith("observation:")) {
    const observationId = activeKey.slice("observation:".length);
    const observation = trace.observations.find((item) => item.id === observationId);
    if (observation !== undefined) {
      return {
        title: traceObservationLabel(observation),
        tone: observation.kind,
        startedAt: formatTraceTime(observation.startedAt),
        durationMs: observation.durationMs,
        firstDeltaMs: firstDeltaMsFromMetadata(observation.metadata),
        usage: observationUsageText(observation),
        input: observation.input,
        output: observation.output,
        error: observation.error,
        metadata: {
          status: observation.status,
          turn: observation.turn,
          startedAt: observation.startedAt,
          endedAt: observation.endedAt ?? null,
          ...(observation.metadata ?? {}),
        },
      };
    }
  }
  return {
    title: trace.name ?? "support-ticket-summary",
    tone: "trace",
    startedAt: formatTraceTime(trace.startedAt),
    durationMs: trace.durationMs,
    firstDeltaMs: firstDeltaMsFromObservations(trace.observations),
    usage: formatUsage(trace.usage),
    input: trace.input,
    output: trace.output,
    error: trace.error,
    metadata: trace.metadata ?? {},
  };
}

function traceObservationLabel(observation: TraceObservationItem): string {
  return observation.kind === "tool" ? `tool.${observation.name}` : observation.name;
}

function firstDeltaMsFromObservations(observations: TraceObservationItem[]): number | undefined {
  for (const observation of observations) {
    const firstDeltaMs = firstDeltaMsFromMetadata(observation.metadata);
    if (firstDeltaMs !== undefined) {
      return firstDeltaMs;
    }
  }
  return undefined;
}

function firstDeltaMsFromMetadata(metadata: unknown): number | undefined {
  if (!isRecord(metadata) || typeof metadata.firstDeltaMs !== "number") {
    return undefined;
  }
  return metadata.firstDeltaMs;
}

function statusDotClass(status: StudioTrace["status"]): string {
  switch (status) {
    case "success":
      return "bg-primary";
    case "error":
      return "bg-destructive";
    case "running":
      return "bg-chart-2";
  }
}

function traceToneDotClass(
  tone: "trace" | "agent" | "turn" | StudioTrace["observations"][number]["kind"],
): string {
  switch (tone) {
    case "trace":
      return "border-primary bg-primary/20";
    case "agent":
      return "border-chart-2 bg-chart-2/20";
    case "turn":
      return "border-chart-4 bg-chart-4/20";
    case "generation":
      return "border-chart-1 bg-chart-1/20";
    case "tool":
      return "border-chart-5 bg-chart-5/20";
  }
}

function observationUsageText(observation: TraceObservationItem): string {
  if (!isRecord(observation.output) || !isRecord(observation.output.usage)) {
    return "";
  }
  return formatUsageValue(observation.output.usage);
}

function turnUsageText(observations: TraceObservationItem[]): string {
  const totals = observations
    .map(observationUsageText)
    .filter((usage) => usage.length > 0)
    .join(" + ");
  return totals;
}

function formatUsageValue(value: Record<string, unknown>): string {
  const input = typeof value.inputTokens === "number" ? value.inputTokens : 0;
  const output = typeof value.outputTokens === "number" ? value.outputTokens : 0;
  const total = typeof value.totalTokens === "number" ? value.totalTokens : input + output;
  if (total === 0) {
    return "";
  }
  return `${input} -> ${output} (Σ ${total})`;
}
