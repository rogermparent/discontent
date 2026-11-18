import type { ReactNode } from "react";
import clsx from "clsx";

export type RowTone = "ok" | "warn" | "muted";

/**
 * One upkeep row (48d, B): what it is and its state, what it did last, when
 * you'd step in, and its button. The editor does each by itself; the row
 * says when a person would.
 */
export function UpkeepRow({
  title,
  state,
  tone = "muted",
  when,
  actions,
  children,
  testId,
}: {
  title: ReactNode;
  state?: ReactNode;
  tone?: RowTone;
  when?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="grid gap-3 border-t py-4 first:border-t-0 first:pt-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6"
      data-testid={testId}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="text-[15px] leading-[22px] font-semibold">
          {title}
          {state && (
            <span
              className={clsx(
                "font-medium",
                tone === "ok" && "text-success",
                tone === "warn" && "text-warning",
                tone === "muted" && "text-muted-foreground",
              )}
            >
              {" · "}
              {state}
            </span>
          )}
        </h3>
        {children}
        {when && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              When you&apos;d need it:
            </span>{" "}
            {when}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {actions}
        </div>
      )}
    </div>
  );
}
