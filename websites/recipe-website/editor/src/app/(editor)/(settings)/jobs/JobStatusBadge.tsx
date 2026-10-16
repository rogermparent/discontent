import { cn } from "@discontent/component-library/lib/utils";

/** A job's status as a small word with its colour (the word carries it). */
export function JobStatusBadge({ status }: { status: string }) {
  return (
    <span
      data-testid="job-status"
      className={cn(
        "inline-block rounded px-1.5 py-0.5 font-mono text-xs",
        status === "done" && "bg-muted text-foreground",
        (status === "running" || status === "queued") &&
          "bg-primary text-primary-foreground",
        (status === "failed" || status === "interrupted") &&
          "bg-destructive text-white",
        status === "cancelled" && "border text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

/** "2026-10-15 19:40:34" in the reader's own zone. */
export function formatWhen(epoch: number | undefined): string {
  if (epoch === undefined) return "";
  const date = new Date(epoch);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
