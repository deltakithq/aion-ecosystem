import { Trash2 } from "lucide-react";
import type { StudioConfig, StudioSessionSummary } from "../../../../types";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { cn } from "../../lib/utils";
import { agentLabel, formatRelativeTime } from "../shared/format";
import type { SessionLoadState } from "../shared/types";

export function SessionsPage(props: {
  agents: StudioConfig["agents"];
  sessions: StudioSessionSummary[];
  sessionsEnabled: boolean;
  sessionLoadState: SessionLoadState;
  selectedSessionId: string;
  onOpenSession: (sessionId: string) => void;
  onDeleteSession: (session: StudioSessionSummary) => void;
}) {
  if (!props.sessionsEnabled) {
    return (
      <div className="w-full rounded-lg border border-dashed border-border p-8 text-sm font-medium text-muted-foreground">
        Sessions are disabled
      </div>
    );
  }

  return (
    <section className="grid min-h-0 w-full content-start gap-4" aria-label="Sessions">
      <header className="flex min-w-0 items-center justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            History
          </p>
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Sessions</h1>
        </div>
      </header>
      <Card className="grid gap-1 rounded-lg border-border bg-background p-2">
        {props.sessionLoadState === "loading" && props.sessions.length === 0 ? (
          <div className="rounded-md px-2 py-2 text-xs font-medium text-muted-foreground">
            Loading sessions
          </div>
        ) : null}
        {props.sessionLoadState === "idle" && props.sessions.length === 0 ? (
          <div className="rounded-md px-2 py-2 text-xs font-medium text-muted-foreground">
            No sessions
          </div>
        ) : null}
        {props.sessions.map((session) => (
          <div
            className={cn(
              "grid min-h-14 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-4 rounded-md border border-transparent px-3 py-2 text-left text-muted-foreground",
              session.id === props.selectedSessionId && "bg-muted text-foreground",
            )}
            key={session.id}
          >
            <Button
              className="grid h-auto min-h-0 min-w-0 justify-start rounded-none border-0 bg-transparent p-0 text-left text-inherit hover:bg-transparent hover:text-inherit"
              type="button"
              variant="ghost"
              onClick={() => props.onOpenSession(session.id)}
            >
              <span className="grid min-w-0 gap-0.5">
                <strong className="min-w-0 truncate text-sm font-medium text-current">
                  {session.title ?? "Untitled chat"}
                </strong>
                <small className="text-xs font-medium text-muted-foreground">
                  {agentLabel(props.agents, session.agentId)}
                </small>
              </span>
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              {session.messageCount} messages
            </span>
            <time className="text-xs font-medium text-muted-foreground">
              {formatRelativeTime(session.updatedAt)}
            </time>
            <Button
              aria-label={`Delete ${session.title ?? "Untitled chat"}`}
              className="h-7 min-h-7 w-7 border-0 bg-transparent p-0 text-muted-foreground opacity-80 hover:bg-transparent hover:text-destructive hover:opacity-100 [&_svg]:h-3.5 [&_svg]:w-3.5"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => props.onDeleteSession(session)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
      </Card>
    </section>
  );
}

export function DeleteSessionDialog(props: {
  session: StudioSessionSummary | undefined;
  onOpenChange: (open: boolean) => void;
  onConfirm: (session: StudioSessionSummary) => void;
}) {
  const title = props.session?.title ?? "Untitled chat";

  return (
    <Dialog open={props.session !== undefined} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete session</DialogTitle>
          <DialogDescription>
            Delete "{title}" and its traces. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (props.session !== undefined) {
                props.onConfirm(props.session);
              }
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
