import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { approvalLabel } from "../shared/format";
import { MarkdownText, ToolPayload } from "../shared/renderers";
import type { ToolApproval, ToolMessage, TranscriptEntry } from "../shared/types";

export function TranscriptItem(props: {
  entry: TranscriptEntry;
  decidingApprovals: Set<string>;
  onApprovalDecision: (approvalId: string, approved: boolean) => void;
}) {
  if (props.entry.kind === "reasoning") {
    return (
      <article
        className="max-w-[820px] justify-self-start text-muted-foreground"
        data-entry-id={String(props.entry.entryId)}
      >
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Reasoning</div>
        <MarkdownText text={props.entry.text} />
      </article>
    );
  }

  if (props.entry.kind === "tool") {
    return (
      <ToolEntry
        entry={props.entry}
        decidingApprovals={props.decidingApprovals}
        onApprovalDecision={props.onApprovalDecision}
      />
    );
  }

  return (
    <article
      className={cn(
        "max-w-[min(78ch,100%)] self-start",
        props.entry.role === "assistant" && "justify-self-start text-foreground",
        props.entry.role === "user" &&
          "w-fit max-w-[min(64ch,82%)] justify-self-end rounded-lg border border-border bg-muted px-3 py-2 text-foreground",
      )}
      data-entry-id={String(props.entry.entryId)}
    >
      <MarkdownText text={props.entry.text} />
    </article>
  );
}

function ToolEntry(props: {
  entry: ToolMessage;
  decidingApprovals: Set<string>;
  onApprovalDecision: (approvalId: string, approved: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const approval = props.entry.approval;
  const hasPayload =
    props.entry.args !== undefined || props.entry.result !== undefined || approval !== undefined;
  const pendingApproval = approval?.status === "pending";
  const deciding = approval !== undefined && props.decidingApprovals.has(approval.id);

  return (
    <article
      className="w-full max-w-[min(760px,100%)] justify-self-start rounded-lg border border-border bg-background p-3 text-foreground"
      data-entry-id={String(props.entry.entryId)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Button
          aria-expanded={!collapsed}
          className="h-auto min-h-0 min-w-0 flex-1 justify-between rounded-none border-0 bg-transparent p-0 text-left text-inherit hover:bg-transparent hover:text-inherit"
          type="button"
          variant="ghost"
          onClick={() => setCollapsed((current) => !current)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Badge className="rounded-md border-border bg-muted px-2 py-1 text-[11px] uppercase text-foreground">
              Tool call
            </Badge>
            <strong className="[overflow-wrap:anywhere] text-sm font-semibold text-foreground">
              {props.entry.toolName}
            </strong>
          </span>
          {pendingApproval ? null : (
            <span className="ml-auto text-xs font-medium text-muted-foreground">
              {collapsed ? "Show" : "Hide"}
            </span>
          )}
        </Button>
        {pendingApproval && approval !== undefined ? (
          <ToolApprovalActions
            compact
            disabled={deciding}
            onDecision={(approved) => props.onApprovalDecision(approval.id, approved)}
          />
        ) : null}
        {pendingApproval ? (
          <Button
            aria-expanded={!collapsed}
            className="h-8 min-h-8 px-2 text-xs font-medium"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? "Show" : "Hide"}
          </Button>
        ) : null}
      </div>
      {collapsed || !hasPayload ? null : (
        <div className="mt-3 grid gap-3 border-t border-border pt-3">
          {approval === undefined ? null : (
            <ToolApprovalPanel
              approval={approval}
              disabled={deciding}
              onDecision={(approved) => props.onApprovalDecision(approval.id, approved)}
            />
          )}
          {props.entry.args === undefined ? null : (
            <ToolPayload title="Input" value={props.entry.args} />
          )}
          {props.entry.result === undefined ? null : (
            <ToolPayload title="Output" value={props.entry.result} />
          )}
        </div>
      )}
    </article>
  );
}

function ToolApprovalPanel(props: {
  approval: ToolApproval;
  disabled: boolean;
  onDecision: (approved: boolean) => void;
}) {
  const pending = props.approval.status === "pending";
  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Approval</div>
          <div className="mt-0.5 text-sm font-medium text-foreground">
            {approvalLabel(props.approval)}
          </div>
        </div>
        {pending ? (
          <ToolApprovalActions disabled={props.disabled} onDecision={props.onDecision} />
        ) : null}
      </div>
      {props.approval.reason === undefined ? null : (
        <div className="text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">
          {props.approval.reason}
        </div>
      )}
    </div>
  );
}

function ToolApprovalActions(props: {
  compact?: boolean;
  disabled: boolean;
  onDecision: (approved: boolean) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        className={cn(props.compact ? "h-7 min-h-7 px-2 text-xs" : "h-8 min-h-8")}
        disabled={props.disabled}
        size="sm"
        type="button"
        onClick={() => props.onDecision(true)}
      >
        Approve
      </Button>
      <Button
        className={cn(props.compact ? "h-7 min-h-7 px-2 text-xs" : "h-8 min-h-8")}
        disabled={props.disabled}
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => props.onDecision(false)}
      >
        Reject
      </Button>
    </div>
  );
}
