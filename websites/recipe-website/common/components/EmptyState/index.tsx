import { ReactNode } from "react";

/**
 * Shared empty-state block for pages/sections with no content yet.
 * Renders no list items, so it is safe on pages that assert an empty list.
 */
export function EmptyState({
  title,
  message,
  action,
}: {
  title?: ReactNode;
  message: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="text-center my-8 text-muted-foreground">
      {title && (
        <p className="text-lg font-semibold mb-1 text-foreground">{title}</p>
      )}
      <p className="mb-4">{message}</p>
      {action}
    </div>
  );
}
