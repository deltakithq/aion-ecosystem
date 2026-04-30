import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { parseToolDisplayValue } from "./format";
import { isRecord } from "./object";

export function MarkdownText(props: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none text-current [overflow-wrap:anywhere] prose-headings:text-current prose-headings:font-semibold prose-p:text-current prose-a:text-current prose-a:decoration-muted-foreground prose-a:underline-offset-2 prose-strong:text-current prose-code:rounded-md prose-code:border prose-code:border-border prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.92em] prose-code:font-semibold prose-code:text-current prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-auto prose-pre:rounded-lg prose-pre:border prose-pre:border-border prose-pre:bg-background prose-pre:text-current prose-blockquote:border-border prose-blockquote:text-muted-foreground prose-li:marker:text-muted-foreground prose-hr:border-border dark:prose-invert dark:prose-headings:text-current dark:prose-p:text-current dark:prose-strong:text-current dark:prose-code:text-current dark:prose-pre:bg-background dark:prose-pre:text-current">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{props.text}</ReactMarkdown>
    </div>
  );
}

export function ToolPayload(props: { title: string; value: string }) {
  const parsed = parseToolDisplayValue(props.value);

  return (
    <section className="grid gap-2">
      <div className="text-[11px] font-semibold uppercase text-muted-foreground">{props.title}</div>
      {parsed.kind === "json" ? (
        <JsonValueView value={parsed.value} />
      ) : (
        <div className="min-w-0 whitespace-pre-wrap rounded-md border border-border bg-background/40 p-2 text-[13px] leading-5 text-foreground [overflow-wrap:anywhere]">
          {parsed.value}
        </div>
      )}
    </section>
  );
}

export function JsonValueView(props: { value: unknown }) {
  if (Array.isArray(props.value)) {
    if (props.value.length === 0) {
      return <span className="italic text-muted-foreground">Empty array</span>;
    }

    return (
      <div className="grid gap-1.5">
        {Object.entries(props.value).map(([key, item]) => (
          <JsonRow key={key} label={key} value={item} />
        ))}
      </div>
    );
  }

  if (isRecord(props.value)) {
    const entries = Object.entries(props.value);
    if (entries.length === 0) {
      return <span className="italic text-muted-foreground">Empty object</span>;
    }

    return (
      <div className="grid gap-1.5">
        {entries.map(([key, value]) => (
          <JsonRow key={key} label={key} value={value} />
        ))}
      </div>
    );
  }

  return <JsonScalar value={props.value} />;
}

function JsonRow(props: { label: string; value: unknown }) {
  const nested = Array.isArray(props.value) || isRecord(props.value);
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(92px,max-content)_minmax(0,1fr)] items-baseline gap-2.5",
        nested && "items-start",
      )}
    >
      <div className="text-xs font-semibold text-muted-foreground [overflow-wrap:anywhere]">
        {props.label}
      </div>
      <div className="min-w-0 text-[13px] leading-5 text-foreground [overflow-wrap:anywhere] [&_.grid]:mt-2 [&_.grid]:border-l [&_.grid]:border-border [&_.grid]:pl-3">
        {nested ? <JsonValueView value={props.value} /> : <JsonScalar value={props.value} />}
      </div>
    </div>
  );
}

function JsonScalar(props: { value: unknown }) {
  if (props.value === null) {
    return <span className="italic text-muted-foreground">null</span>;
  }
  if (typeof props.value === "string") {
    return <span>{props.value}</span>;
  }
  if (typeof props.value === "number") {
    return <span>{props.value}</span>;
  }
  if (typeof props.value === "boolean") {
    return <span>{String(props.value)}</span>;
  }
  return <span>{String(props.value)}</span>;
}
