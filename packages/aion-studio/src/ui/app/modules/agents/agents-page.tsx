import type { StudioConfig } from "../../../../types";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { cn } from "../../lib/utils";
import { JsonValueView } from "../shared/renderers";

export function AgentsPage(props: { agents: StudioConfig["agents"]; selectedAgentId: string }) {
  return (
    <section className="grid min-h-0 w-full content-start gap-4" aria-label="Agents">
      <header className="flex min-w-0 items-center justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
            Registry
          </p>
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Agents</h1>
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {props.agents.length === 0 ? (
          <div className="rounded-md px-2 py-2 text-xs font-medium text-muted-foreground">
            No agents
          </div>
        ) : null}
        {props.agents.map((agent) => (
          <Card
            className={cn(
              "grid content-start rounded-lg border-border bg-background text-foreground",
              agent.id === props.selectedAgentId && "border-ring bg-muted text-foreground",
            )}
            key={agent.id}
          >
            <CardHeader className="grid min-w-0 gap-1 p-4 pb-2">
              <h2 className="m-0 min-w-0 truncate text-base font-semibold text-foreground">
                {agent.name ?? agent.id}
              </h2>
              <span className="font-mono text-xs font-medium text-muted-foreground">
                {agent.id}
              </span>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-0">
              {agent.description === undefined ? null : (
                <p className="m-0 text-sm leading-6 text-muted-foreground">{agent.description}</p>
              )}
              {agent.quickPrompts.length === 0 ? null : (
                <div className="flex flex-wrap gap-1.5">
                  {agent.quickPrompts.map((prompt) => (
                    <Badge key={prompt}>{prompt}</Badge>
                  ))}
                </div>
              )}
              {agent.metadata === undefined ? null : (
                <div className="rounded-md border border-border bg-background/40 p-2">
                  <JsonValueView value={agent.metadata} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
